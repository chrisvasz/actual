import {
  onChanges,
  runQuerySync,
} from '@actual-app/core/platform/client/live-reads';
import type { BudgetChanges } from '@actual-app/core/platform/client/live-reads';
import { createRegisterRows } from '@actual-app/core/shared/register-rows';
import type { RegisterGroup } from '@actual-app/core/shared/register-rows';

import { freezeInDev } from '#queries/liveStore';

// The rows of every account register: all of the open budget's
// transactions, kept in memory and current (see `register-rows`). Each
// register shows its scope of them (`register-view`).
//
// Reading every row takes too long for one task on a large budget, so once a
// budget opens they're read in short chunks between other work. Opening a
// register then reads nothing; one opened before that reads what's left.

/** Every row: each split parent or standalone transaction with its children. */
export type RegisterSnapshot = {
  readonly groups: readonly RegisterGroup[];
  /** `groups` by their parent's account */
  readonly groupsByAccount: ReadonlyMap<string, readonly RegisterGroup[]>;
  /** Why the rows couldn't be read; `groups` are the last ones read. */
  readonly error?: Error;
};

const rows = createRegisterRows(runQuerySync);

let snapshot: RegisterSnapshot | null = null;
const listeners = new Set<() => void>();
let stopListening: (() => void) | null = null;
let isNotifyScheduled = false;
let isLoadScheduled = false;

function handleChanges(changes: BudgetChanges) {
  if (rows.applyChanges(changes) && !isNotifyScheduled) {
    // Once per burst of changes, like the live store
    isNotifyScheduled = true;
    queueMicrotask(notify);
  }
  if (changes === 'all') {
    scheduleLoad();
  }
}

function notify() {
  isNotifyScheduled = false;
  for (const listener of [...listeners]) {
    listener();
  }
}

const whenIdle: (callback: () => void) => void =
  typeof requestIdleCallback === 'function'
    ? callback => requestIdleCallback(callback, { timeout: 500 })
    : callback => setTimeout(callback, 0);

function scheduleLoad() {
  if (isLoadScheduled) {
    return;
  }
  isLoadScheduled = true;
  whenIdle(() => {
    isLoadScheduled = false;
    if (rows.loadSome()) {
      scheduleLoad();
    }
  });
}

/**
 * Follow the open budget's changes, reading its rows in the background each
 * time a budget opens. Called once, as the app starts.
 */
export function listenForRegisterRows() {
  stopListening ??= onChanges(handleChanges);
}

/** The rows now, reading any they're missing. */
export function getRegisterSnapshot(): RegisterSnapshot {
  listenForRegisterRows();
  try {
    const groups = rows.getGroups();
    const groupsByAccount = rows.getGroupsByAccount();
    if (
      snapshot?.groups !== groups ||
      snapshot.groupsByAccount !== groupsByAccount ||
      snapshot.error
    ) {
      snapshot = {
        groups: freezeInDev(groups),
        groupsByAccount: freezeInDev(groupsByAccount),
      };
    }
  } catch (e) {
    const error = e as Error;
    if (snapshot?.error !== error) {
      snapshot = {
        groups: snapshot?.groups ?? [],
        groupsByAccount: snapshot?.groupsByAccount ?? new Map(),
        error,
      };
    }
  }
  return snapshot;
}

/** Call `listener` after changes that may change the rows. */
export function subscribeToRegisterRows(listener: () => void) {
  listenForRegisterRows();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// A hot-reloaded copy of this module listens on its own
import.meta.hot?.dispose(() => stopListening?.());
