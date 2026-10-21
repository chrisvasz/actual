import {
  onChanges,
  readSync,
  runQuerySync,
} from '@actual-app/core/platform/client/live-reads';
import type {
  BudgetChanges,
  LiveReadArgs,
  LiveReadData,
  LiveReadName,
} from '@actual-app/core/platform/client/live-reads';
import type { Query } from '@actual-app/core/shared/query';

// Live reads of the open budget: AQL queries, and the backend's named reads
// (`readSync`). The backend runs on this thread and answers a read
// synchronously, so a read never loads: the first one returns rows.
//
// Each read's result is cached, keyed by the serialized query (or the
// read's name and arguments), along with the tables it read. A change to one of those tables only marks the result
// out of date; it's read again the next time someone asks for it. Whoever
// listens to the query is told in a microtask, so the changes one backend
// call applies in a row cost each shown query one read, however many there
// are. (A call that awaits between changes, like a sync fetching pages, is
// read again after each.) A result nobody shows isn't read until it's
// asked for.

/** A live query's latest result: its rows, or the error reading them. */
export type LiveResult<Data> = {
  /** The last rows read; kept from the previous read when one fails. */
  readonly data: Data | undefined;
  readonly error?: Error;
};

/** Read and subscribe to one query, in the shape `useSyncExternalStore` takes. */
export type LiveQueryHandle<Data> = {
  getSnapshot: () => LiveResult<Data>;
  subscribe: (listener: () => void) => () => void;
};

type Entry = {
  key: string;
  run: () => { data: unknown; dependencies: readonly string[] };
  result: LiveResult<unknown> | null;
  /** The tables the last successful read read; null before one. */
  dependencies: readonly string[] | null;
  /** The version of each dependency the last read saw. */
  versions: number[];
  /** `epoch` when last read */
  epoch: number;
  /** `changeCount` when last read, for a read without dependencies */
  changeCount: number;
  listeners: Set<() => void>;
};

const entries = new Map<string, Entry>();
const handles = new WeakMap<Query, LiveQueryHandle<unknown>>();

// Bumped for each change to a table
const tableVersions = new Map<string, number>();
// Bumped for each change to any table
let changeCount = 0;
// Bumped when a budget opens or closes: every result is out of date
let epoch = 0;

// Entries with listeners, by the tables they read. Entries that have never
// read successfully have no known tables, so any change concerns them.
const listenedByTable = new Map<string, Set<Entry>>();
const listenedWithoutDependencies = new Set<Entry>();

let stopListening: (() => void) | null = null;
const toNotify = new Set<Entry>();
let isNotifyScheduled = false;

function handleChanges(changes: BudgetChanges) {
  changeCount++;
  if (changes === 'all') {
    epoch++;
    for (const entry of entries.values()) {
      if (entry.listeners.size > 0) {
        toNotify.add(entry);
      }
    }
  } else {
    for (const table of changes.tables) {
      tableVersions.set(table, (tableVersions.get(table) ?? 0) + 1);
      const listened = listenedByTable.get(table);
      if (listened) {
        for (const entry of listened) {
          toNotify.add(entry);
        }
      }
    }
    for (const entry of listenedWithoutDependencies) {
      toNotify.add(entry);
    }
  }

  if (toNotify.size > 0 && !isNotifyScheduled) {
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

function isStale(entry: Entry) {
  if (entry.result == null || entry.epoch !== epoch) {
    return true;
  }
  if (entry.dependencies == null) {
    return entry.changeCount !== changeCount;
  }
  return entry.dependencies.some(
    (table, i) => (tableVersions.get(table) ?? 0) !== entry.versions[i],
  );
}

function read(entry: Entry): LiveResult<unknown> {
  if (!isStale(entry)) {
    // oxlint-disable-next-line typescript/no-non-null-assertion -- not stale means read
    return entry.result!;
  }

  listen();
  const previous = entry.result;
  let result: LiveResult<unknown>;
  try {
    const read = entry.run();
    const data = replaceEqualDeep(previous?.data, read.data);
    result =
      previous != null && previous.error == null && previous.data === data
        ? previous
        : { data: freezeInDev(data) };
    setDependencies(entry, read.dependencies);
  } catch (e) {
    // The query reads the same tables as when it last succeeded, so it's
    // retried when they change. The same failure again keeps the result.
    const error = e as Error;
    result =
      previous?.error != null && isSameError(previous.error, error)
        ? previous
        : { data: previous?.data, error };
  }

  entry.result = result;
  entry.epoch = epoch;
  entry.changeCount = changeCount;
  entry.versions = (entry.dependencies ?? []).map(
    table => tableVersions.get(table) ?? 0,
  );
  return result;
}

function index(entry: Entry) {
  if (entry.dependencies == null) {
    listenedWithoutDependencies.add(entry);
    return;
  }
  for (const table of entry.dependencies) {
    let listened = listenedByTable.get(table);
    if (!listened) {
      listened = new Set();
      listenedByTable.set(table, listened);
    }
    listened.add(entry);
  }
}

function unindex(entry: Entry) {
  listenedWithoutDependencies.delete(entry);
  for (const table of entry.dependencies ?? []) {
    listenedByTable.get(table)?.delete(entry);
  }
}

function isSameError(a: Error, b: Error) {
  const typeOf = (error: Error) => (error as { type?: unknown }).type;
  return (
    typeOf(a) === typeOf(b) && a.message === b.message && a.name === b.name
  );
}

function setDependencies(entry: Entry, dependencies: readonly string[]) {
  if (
    entry.dependencies != null &&
    entry.dependencies.length === dependencies.length &&
    entry.dependencies.every((table, i) => table === dependencies[i])
  ) {
    return;
  }
  const isListened = entry.listeners.size > 0;
  if (isListened) {
    unindex(entry);
  }
  entry.dependencies = dependencies;
  if (isListened) {
    index(entry);
  }
}

// The entry for `key`. `remembered` is the one a handle last used: if it
// was collected (nothing listened for a tick) it's put back, keeping its
// result, rather than read again from scratch.
function getEntry(
  key: string,
  run: Entry['run'],
  remembered: Entry | null,
): Entry {
  let entry = entries.get(key);
  if (!entry && remembered) {
    entry = remembered;
    entries.set(key, entry);
    collectLater(entry);
  } else if (!entry) {
    entry = {
      key,
      run,
      result: null,
      dependencies: null,
      versions: [],
      epoch,
      changeCount,
      listeners: new Set(),
    };
    entries.set(key, entry);
    // Read during a render that never commits
    collectLater(entry);
  }
  return entry;
}

// Start following the backend's changes, before the first read, so no
// change between a read and a later subscription goes unrecorded
function listen() {
  stopListening ??= onChanges(handleChanges);
}

function subscribe(entry: Entry, listener: () => void) {
  listen();
  if (entry.listeners.size === 0) {
    index(entry);
  }
  entry.listeners.add(listener);

  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) {
      unindex(entry);
      toNotify.delete(entry);
      collectLater(entry);
    }
  };
}

// Drop a result nothing listens to. Not right away: a screen that remounts
// (or a Strict Mode effect re-run) picks its result back up.
function collectLater(entry: Entry) {
  setTimeout(() => {
    if (entry.listeners.size === 0 && entries.get(entry.key) === entry) {
      entries.delete(entry.key);
    }
  }, 0);
}

/**
 * The live result of `query`: the same handle for the same query object,
 * sharing its cached result with every equal query.
 */
export function getLiveQuery<Data = unknown>(
  query: Query,
): LiveQueryHandle<Data> {
  let handle = handles.get(query);
  if (!handle) {
    handle = makeHandle(JSON.stringify(query.serialize()), () =>
      runQuerySync(query),
    );
    handles.set(query, handle);
  }
  return handle as LiveQueryHandle<Data>;
}

/**
 * The live result of the backend's named read `name` with `args`, sharing
 * its cached result with every other handle to the same read. Each call
 * makes a new handle; keep it stable for `useSyncExternalStore`.
 */
export function getLiveRead<Name extends LiveReadName>(
  name: Name,
  args?: LiveReadArgs<Name>,
): LiveQueryHandle<LiveReadData<Name>> {
  return makeHandle(
    `read:${name}:${JSON.stringify(args ?? null)}`,
    // oxlint-disable-next-line typescript/no-explicit-any -- args match `name`
    () => (readSync as any)(name, args),
  ) as LiveQueryHandle<LiveReadData<Name>>;
}

function makeHandle(key: string, run: Entry['run']): LiveQueryHandle<unknown> {
  let last: Entry | null = null;
  const current = () => (last = getEntry(key, run, last));
  return {
    getSnapshot: () => read(current()),
    subscribe: listener => subscribe(current(), listener),
  };
}

/**
 * Call `onResult` with `query`'s result now, and again whenever it
 * changes. Returns a function that stops watching.
 */
export function watchLiveQuery<Data = unknown>(
  query: Query,
  onResult: (result: LiveResult<Data>) => void,
): () => void {
  const handle = getLiveQuery<Data>(query);
  let last = handle.getSnapshot();
  onResult(last);
  return handle.subscribe(() => {
    const next = handle.getSnapshot();
    if (next !== last) {
      last = next;
      onResult(next);
    }
  });
}

/**
 * `next`, reusing every part of `previous` that is deeply equal to it, so
 * a re-read that changed one row hands back the other rows (and an
 * unchanged read the whole result) by reference.
 */
export function replaceEqualDeep(previous: unknown, next: unknown): unknown {
  if (Object.is(previous, next)) {
    return previous;
  }
  const isArray = Array.isArray(previous) && Array.isArray(next);
  if (!isArray && !(isPlainObject(previous) && isPlainObject(next))) {
    return next;
  }

  const prevItems = previous as Record<string, unknown>;
  const nextItems = next as Record<string, unknown>;
  const prevKeys = isArray ? null : Object.keys(prevItems);
  const keys = isArray ? null : Object.keys(nextItems);
  const size = isArray ? (next as unknown[]).length : (keys as string[]).length;
  const copy = (isArray ? [] : {}) as Record<string, unknown>;
  let equalCount = 0;

  for (let i = 0; i < size; i++) {
    const key = isArray ? i : (keys as string[])[i];
    const value = replaceEqualDeep(prevItems[key], nextItems[key]);
    copy[key] = value;
    if (Object.is(value, prevItems[key]) && (isArray || key in prevItems)) {
      equalCount++;
    }
  }

  const prevSize = isArray
    ? (previous as unknown[]).length
    : (prevKeys as string[]).length;
  return prevSize === size && equalCount === size ? previous : copy;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Results are shared by every reader of a query; freezing them in
// development catches code that changes one in place
export function freezeInDev<T>(value: T): T {
  if (import.meta.env.DEV) {
    deepFreeze(value);
  }
  return value;
}

function deepFreeze(value: unknown) {
  if (value == null || typeof value !== 'object' || Object.isFrozen(value)) {
    return;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
}

// A hot-reloaded copy of this module listens on its own
import.meta.hot?.dispose(() => stopListening?.());

/** Only for tests: forget every result and stop listening. */
export function resetLiveStoreForTests() {
  stopListening?.();
  stopListening = null;
  entries.clear();
  listenedByTable.clear();
  listenedWithoutDependencies.clear();
  tableVersions.clear();
  toNotify.clear();
  changeCount = 0;
  epoch++;
}
