import {
  onChanges,
  runQuerySync,
} from '@actual-app/core/platform/client/live-reads';
import type { BudgetChanges } from '@actual-app/core/platform/client/live-reads';
import { createRegisterRows } from '@actual-app/core/shared/register-rows';
import type {
  RegisterGroup,
  RegisterRows,
} from '@actual-app/core/shared/register-rows';
import { registerFilter } from '@actual-app/core/shared/register-view';
import type { RegisterScope } from '@actual-app/core/shared/register-view';

import { freezeInDev } from '#queries/liveStore';

// The rows of each open account register, kept in memory and current (see
// `register-rows`). A register reads its rows when it opens, and drops them
// once nothing shows it.

/** A register's rows: each split parent or standalone transaction with its children. */
export type RegisterSnapshot = {
  readonly groups: readonly RegisterGroup[];
  /** Why the rows couldn't be read; `groups` are the last ones read. */
  readonly error?: Error;
};

/** Read and subscribe to one register's rows, for `useSyncExternalStore`. */
export type RegisterHandle = {
  getSnapshot: () => RegisterSnapshot;
  subscribe: (listener: () => void) => () => void;
};

type Entry = {
  rows: RegisterRows;
  snapshot: RegisterSnapshot | null;
  listeners: Set<() => void>;
  handle: RegisterHandle;
};

const NO_GROUPS: readonly RegisterGroup[] = [];

const entries = new Map<string, Entry>();
const toNotify = new Set<Entry>();
let isNotifyScheduled = false;
let stopListening: (() => void) | null = null;

function handleChanges(changes: BudgetChanges) {
  for (const entry of entries.values()) {
    if (entry.rows.applyChanges(changes)) {
      toNotify.add(entry);
    }
  }
  if (toNotify.size > 0 && !isNotifyScheduled) {
    // Once per burst of changes, like the live store
    isNotifyScheduled = true;
    queueMicrotask(notify);
  }
}

function notify() {
  isNotifyScheduled = false;
  const notified = [...toNotify];
  toNotify.clear();
  for (const entry of notified) {
    for (const listener of [...entry.listeners]) {
      listener();
    }
  }
}

function read(entry: Entry): RegisterSnapshot {
  try {
    const groups = entry.rows.getGroups();
    if (entry.snapshot?.groups !== groups || entry.snapshot.error) {
      entry.snapshot = { groups: freezeInDev(groups) };
    }
  } catch (e) {
    const error = e as Error;
    if (entry.snapshot?.error !== error) {
      entry.snapshot = { groups: entry.snapshot?.groups ?? NO_GROUPS, error };
    }
  }
  return entry.snapshot;
}

// Drop rows nothing shows. Not right away: a screen that remounts (or a
// Strict Mode effect re-run) picks them back up.
function collectLater(key: string, entry: Entry) {
  setTimeout(() => {
    if (entry.listeners.size === 0 && entries.get(key) === entry) {
      entries.delete(key);
      toNotify.delete(entry);
    }
  }, 0);
}

/** The rows of `scope`'s register, read when first asked for. */
export function getRegisterRows(scope: RegisterScope): RegisterHandle {
  // Follow changes before the first read, so none is missed
  stopListening ??= onChanges(handleChanges);
  const key = scope ?? '';
  let entry = entries.get(key);
  if (!entry) {
    const created: Entry = {
      rows: createRegisterRows(runQuerySync, {
        filter: registerFilter(scope),
      }),
      snapshot: null,
      listeners: new Set(),
      handle: {
        getSnapshot: () => read(created),
        subscribe: listener => {
          // Collected meanwhile, it missed changes: read everything again
          if (entries.get(key) !== created) {
            created.rows.applyChanges('all');
            entries.set(key, created);
          }
          created.listeners.add(listener);
          return () => {
            created.listeners.delete(listener);
            if (created.listeners.size === 0) {
              collectLater(key, created);
            }
          };
        },
      },
    };
    entry = created;
    entries.set(key, entry);
    // Read during a render that never commits
    collectLater(key, entry);
  }
  return entry.handle;
}

// A hot-reloaded copy of this module listens on its own
import.meta.hot?.dispose(() => stopListening?.());
