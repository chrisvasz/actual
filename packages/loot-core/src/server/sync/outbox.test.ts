import {
  getClock,
  makeClock,
  serializeClock,
  setClock,
  Timestamp,
} from '@actual-app/crdt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as persistence from '#platform/server/persistence';
import * as sqlite from '#platform/server/sqlite';
import * as db from '#server/db';
import * as mappings from '#server/db/mappings';
import { app as schedulesApp } from '#server/schedules/app';
import * as rules from '#server/transactions/transaction-rules';

import {
  addSyncListener,
  applyMessages,
  replayOutbox,
  setSyncingMode,
} from './index';
import type { Message } from './index';

// The test setup mocks persistence with an in-memory outbox
// (helpers from platform/server/persistence/__mocks__)
const outbox = persistence as unknown as {
  _capture(enabled: boolean): void;
  _getBatches(): persistence.OutboxBatch[];
  _setPending(next: persistence.OutboxBatch[]): void;
};

type Snapshot = { bytes: Buffer; seq: number };

beforeEach(async () => {
  setSyncingMode('enabled');
  await global.emptyDatabase()();
  outbox._capture(true);
});

afterEach(() => {
  outbox._capture(false);
  setSyncingMode('disabled');
});

function sendTimestamp(): Timestamp {
  const timestamp = Timestamp.send();
  if (timestamp == null) {
    throw new Error('Timestamp.send() returned null');
  }
  return timestamp;
}

// A timestamp from another device
let remoteMillis = Date.now() - 60_000;
function remoteTimestamp(): Timestamp {
  remoteMillis += 1000;
  return new Timestamp(remoteMillis, 0, 'aaaaaaaaaaaaaaaa');
}

function cell(
  dataset: string,
  row: string,
  column: string,
  value: string | number | null,
  timestamp = sendTimestamp(),
): Message {
  return { dataset, row, column, value, timestamp };
}

function takeSnapshot(): Snapshot {
  const handle = db.getDatabase() as unknown as { serialize(): Buffer };
  return { bytes: handle.serialize(), seq: outbox._getBatches().length };
}

// Every row of every table
function dumpDatabase() {
  const tables = db.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  );
  return Object.fromEntries(
    tables.map(({ name }) => [
      name,
      db
        .all(`SELECT * FROM "${name}"`)
        .map(row => JSON.stringify(row))
        .sort(),
    ]),
  );
}

function captureState() {
  return { dump: dumpDatabase(), clock: serializeClock(getClock()) };
}

// Simulates closing the tab and opening the budget again: the database
// comes back from the snapshot, the in-memory clock is lost, and the
// outbox batches newer than the snapshot are replayed
async function reopen(snapshot: Snapshot) {
  const recorded = outbox._getBatches();
  const pending = recorded.slice(snapshot.seq);
  // Typed as the web (sql.js) backend, but tests run on better-sqlite3
  const restored = await sqlite.openDatabase(Buffer.from(snapshot.bytes));
  db.setDatabase(restored);
  setClock(makeClock(new Timestamp(0, 0, 'ffffffffffffffff')));
  setSyncingMode('disabled');

  outbox._setPending(pending);
  const recordedCount = recorded.length;
  await replayOutbox();
  // Replay must not log the batches again
  expect(outbox._getBatches()).toHaveLength(recordedCount);

  // What `loadBudget` does after replaying and migrating
  db.loadClock();
}

const insertAccount = (
  id: string,
  name: string,
  makeTimestamp = sendTimestamp,
) => [
  cell('accounts', id, 'name', name, makeTimestamp()),
  cell('accounts', id, 'offbudget', 0, makeTimestamp()),
  cell('accounts', id, 'closed', 0, makeTimestamp()),
];

describe('outbox replay', () => {
  it('restores data, the crdt log, clock and merkle when syncing', async () => {
    const snapshot = takeSnapshot();

    applyMessages(insertAccount('acct1', 'Checking'));
    applyMessages([cell('accounts', 'acct1', 'name', 'Main checking')]);
    // A batch received from the server, with a stale value for one cell
    const stale = remoteTimestamp();
    applyMessages(
      [
        ...insertAccount('acct2', 'Savings', remoteTimestamp),
        cell('accounts', 'acct1', 'name', 'Stale name', stale),
      ],
      true,
    );
    // A message from a newer version, deferred to messages_pending
    applyMessages(
      [cell('transactions', 't1', 'brand_new_column', 'hello')],
      true,
    );

    const before = captureState();
    expect(before.dump.messages_crdt).toHaveLength(9);
    expect(before.dump.messages_pending).toHaveLength(1);

    await reopen(snapshot);

    expect(captureState()).toEqual(before);
  });

  it('restores data when syncing is disabled', async () => {
    setSyncingMode('disabled');
    const snapshot = takeSnapshot();
    const clockRowBefore = db.first('SELECT * FROM messages_clock');

    applyMessages(insertAccount('acct1', 'Checking'));
    applyMessages([cell('accounts', 'acct1', 'name', 'Renamed')]);

    const before = captureState();
    expect(before.dump.messages_crdt).toHaveLength(0);

    await reopen(snapshot);

    // Without syncing nothing writes the clock, so the in-memory clock
    // comes back from the snapshot, exactly as before this change
    expect(db.first('SELECT * FROM messages_clock')).toEqual(clockRowBefore);
    expect(captureState().dump).toEqual(before.dump);
  });

  it('replays batches in their original syncing modes and order', async () => {
    const snapshot = takeSnapshot();

    applyMessages(insertAccount('acct1', 'One'));
    setSyncingMode('disabled');
    applyMessages([cell('accounts', 'acct1', 'name', 'Two')]);
    setSyncingMode('import');
    applyMessages(insertAccount('acct2', 'Imported'));
    setSyncingMode('enabled');
    applyMessages([cell('accounts', 'acct1', 'name', 'Three')]);
    setSyncingMode('disabled');
    applyMessages([cell('accounts', 'acct1', 'name', 'Four')]);

    expect(outbox._getBatches().map(batch => batch.mode)).toEqual([
      'enabled',
      'disabled',
      'import',
      'enabled',
      'disabled',
    ]);
    const before = captureState();

    await reopen(snapshot);

    // The in-memory clock comes back from `messages_clock`, which the
    // disabled-mode batch at the end didn't write (same as a reload
    // before the outbox existed)
    expect(captureState().dump).toEqual(before.dump);
    expect(
      db.first<{ name: string }>('SELECT name FROM accounts WHERE id = ?', [
        'acct1',
      ])?.name,
    ).toBe('Four');
  });

  it('is harmless to replay batches the snapshot already includes', async () => {
    const snapshot = takeSnapshot();

    applyMessages(insertAccount('acct1', 'Checking'));
    setSyncingMode('disabled');
    applyMessages([cell('accounts', 'acct1', 'name', 'Renamed')]);
    setSyncingMode('enabled');
    applyMessages(insertAccount('acct2', 'Savings'));

    const before = captureState();

    // As if the snapshot was written but the outbox wasn't truncated, and
    // the seq check failed: everything is replayed on top of the state
    // that already contains it
    await reopen(snapshot);
    const replayed = takeSnapshot();
    await reopen({ ...replayed, seq: 0 });

    expect(captureState()).toEqual(before);
  });

  it('does not run listeners or log the batches again', async () => {
    const snapshot = takeSnapshot();
    applyMessages(insertAccount('acct1', 'Checking'));

    const listener = vi.fn();
    const unlisten = addSyncListener(listener);
    try {
      await reopen(snapshot);
    } finally {
      unlisten();
    }

    expect(listener).not.toHaveBeenCalled();
    expect(outbox._getBatches()).toHaveLength(1);
  });

  it('rebuilds schedules_json_paths on load', async () => {
    const snapshot = takeSnapshot();
    const conditions = [
      { op: 'is', field: 'payee', value: 'payee1' },
      { op: 'is', field: 'account', value: 'acct1' },
    ];

    mappings.loadMappings();
    rules.loadRules();
    schedulesApp.startServices();
    try {
      applyMessages([
        cell('rules', 'rule1', 'stage', null),
        cell('rules', 'rule1', 'conditions_op', 'and'),
        cell('rules', 'rule1', 'conditions', JSON.stringify(conditions)),
        cell(
          'rules',
          'rule1',
          'actions',
          JSON.stringify([{ op: 'link-schedule', value: 'sched1' }]),
        ),
      ]);
    } finally {
      await schedulesApp.stopServices();
    }

    const paths = db.all('SELECT * FROM schedules_json_paths');
    expect(paths).toEqual([
      expect.objectContaining({
        schedule_id: 'sched1',
        payee: '$[0]',
        account: '$[1]',
      }),
    ]);

    // Replay only restores the rule; listeners don't run...
    await reopen(snapshot);
    expect(db.all('SELECT * FROM schedules_json_paths')).toEqual([]);

    // ...and the schedules service rebuilds the table when the budget loads
    mappings.loadMappings();
    rules.loadRules();
    schedulesApp.startServices();
    await schedulesApp.stopServices();
    expect(db.all('SELECT * FROM schedules_json_paths')).toEqual(paths);
  });
});
