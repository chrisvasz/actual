import type { TransactionEntity } from '#types/models';

import { q } from './query';
import type { Query } from './query';

// The rows of the account registers: every transaction of the open budget,
// in memory, kept current from the rows each change wrote (the client's
// `onChanges`). The groups are what a `splits: grouped` query of every
// transaction reads, in the default order, without its cost: the split
// parents and standalone transactions are read in one query (`splits:
// none`), their children in another, and grouped here.
//
// They're read a chunk at a time from the newest date down, so reading a
// large budget can be spread over many short tasks (`loadSome`). Reading the
// rows (`getGroups`) reads whatever is left at once.
//
// After that a change to transactions re-reads only the groups it touched:
// each changed row's split (its parent and every child), where it was and
// where it is now. A change to any other table the rows are read from (the
// views' payee and category mappings) reads everything again, unless no row
// shows an id it changed. So do an opened or closed budget, a change to more
// than `MAX_CHANGED_ROWS` transactions, and a failed read.
//
// Changes are only recorded until the rows are read, so a burst of them (an
// import, a sync) costs one read.

/** A split parent or standalone transaction, and its split's children. */
export type RegisterGroup = {
  /** The parent or standalone transaction, without `subtransactions` */
  readonly parent: TransactionEntity;
  readonly children: readonly TransactionEntity[];
};

/** A committed change to the budget, as `onChanges` reports it. */
export type RegisterChanges =
  | 'all'
  | {
      readonly tables: readonly string[];
      readonly ids: Readonly<Record<string, readonly string[]>>;
    };

type RunQuery = (query: Query) => {
  data: unknown;
  dependencies: readonly string[];
};

export type RegisterRows = {
  /**
   * Every group, in the default order: the same array until a change
   * touches them, and the same group objects for groups it didn't. Reads
   * the rows not read yet. Throws if reading failed; the next relevant
   * change reads again.
   */
  getGroups: () => readonly RegisterGroup[];
  /**
   * `getGroups`' groups by their parent's account, in the same order: the
   * same map until a change touches them, and the same array for each
   * account it didn't.
   */
  getGroupsByAccount: () => ReadonlyMap<string, readonly RegisterGroup[]>;
  /**
   * Read one more chunk of rows, and apply the changes recorded so far.
   * Returns whether rows are left to read.
   */
  loadSome: () => boolean;
  /** Record `changes`. Returns whether they may change the groups. */
  applyChanges: (changes: RegisterChanges) => boolean;
};

// Above this many changed transactions, reading everything again is about as
// cheap as finding and re-reading what they touched. (On a 50,000-transaction
// budget, re-reading 2,000 of them costs a few tens of milliseconds; reading
// everything, a few hundred.)
export const MAX_CHANGED_ROWS = 10000;

// Above this many changed groups, moving each one is slower than one pass
const MAX_SPLICED_GROUPS = 100;

// The tables whose changes only matter to rows showing a changed id, and the
// field that shows it
const SHOWN_ID_TABLES: Record<string, 'payee' | 'category'> = {
  payee_mapping: 'payee',
  category_mapping: 'category',
};

type Pending = {
  all: boolean;
  transactions: Set<string>;
  payee: Set<string>;
  category: Set<string>;
};

function noPending(): Pending {
  return {
    all: false,
    transactions: new Set(),
    payee: new Set(),
    category: new Set(),
  };
}

/**
 * Every transaction, read with `runQuery`, `chunkSize` groups at a time
 * (finishing the last date a chunk reaches).
 */
export function createRegisterRows(
  runQuery: RunQuery,
  {
    chunkSize = 500,
    maxChangedRows = MAX_CHANGED_ROWS,
  }: { chunkSize?: number; maxChangedRows?: number } = {},
): RegisterRows {
  let groups: RegisterGroup[] = [];
  // Built from `groups` when asked for, then kept current along with it
  let groupsByAccount: Map<string, RegisterGroup[]> | null = null;
  // The group (parent's id) of every row read, and each group by that id
  let groupOf = new Map<string, string>();
  const groupById = new Map<string, RegisterGroup>();
  // The rows read: none, those on or after a date, or all of them
  let read: 'none' | 'all' | { from: string } = 'none';
  // The tables the rows depend on; null until read, when any change may
  // concern them
  let dependencies: readonly string[] | null = null;
  // The last read's failure, until a change reads again
  let failure: { error: Error } | null = null;
  let pending = noPending();

  function forget() {
    groups = [];
    groupsByAccount = null;
    groupOf = new Map();
    groupById.clear();
    read = 'none';
  }

  // The groups whose parent `filter` matches (every group without one), up
  // to `limit` of them
  function readGroups(filter: Record<string, unknown> | null, limit?: number) {
    let parentsQuery = q('transactions').options({ splits: 'none' });
    if (filter) {
      parentsQuery = parentsQuery.filter(filter);
    }
    if (limit != null) {
      parentsQuery = parentsQuery.limit(limit);
    }
    const parents = runQuery(parentsQuery.select('*'))
      .data as TransactionEntity[];
    const parentIds = parents.filter(t => t.is_parent).map(t => t.id);
    if (parentIds.length === 0) {
      return parents.map(parent => ({ parent, children: NO_CHILDREN }));
    }

    // A child is alive while its parent is. The ids are listed rather than
    // looked up in a subquery, which SQLite can plan as a walk over every
    // transaction. `parent_id` is indexed in the views' form.
    const children = runQuery(
      q('transactions')
        .options({ splits: 'inline' })
        .filter(
          filter == null && limit == null
            ? { is_child: true }
            : { parent_id: { $oneof: parentIds } },
        )
        .select('*'),
    ).data as TransactionEntity[];
    const childrenOf = new Map<string, TransactionEntity[]>();
    for (const child of children) {
      const siblings = childrenOf.get(child.parent_id ?? '');
      if (siblings) {
        siblings.push(child);
      } else {
        childrenOf.set(child.parent_id ?? '', [child]);
      }
    }
    return parents.map(parent => ({
      parent,
      children: childrenOf.get(parent.id) ?? NO_CHILDREN,
    }));
  }

  // A new array, since `groups` may have been handed out
  function append(loaded: readonly RegisterGroup[]) {
    for (const group of loaded) {
      index(group);
    }
    groups = groups.concat(loaded);
    groupsByAccount = null;
  }

  function readChunk(limit: number | null) {
    if (read === 'all') {
      return;
    }
    // A query selecting `*` depends on every table its fields refer to, but
    // only reads ids from them. The rows depend on the views' mappings,
    // which a query for no rows reports.
    dependencies ??= runQuery(
      q('transactions').options({ splits: 'none' }).select('id').limit(0),
    ).dependencies;

    const before = read === 'none' ? null : { date: { $lt: read.from } };
    if (limit == null) {
      append(readGroups(before));
      read = 'all';
      return;
    }
    const chunk = readGroups(before, limit);
    if (chunk.length < limit) {
      append(chunk);
      read = 'all';
      return;
    }
    // The chunk may end partway through its last date: read all of it
    const last = chunk[chunk.length - 1].parent.date;
    append(chunk.filter(group => group.parent.date > last));
    append(readGroups({ date: last }));
    read = { from: last };
  }

  function index(group: RegisterGroup) {
    groupById.set(group.parent.id, group);
    groupOf.set(group.parent.id, group.parent.id);
    for (const child of group.children) {
      groupOf.set(child.id, group.parent.id);
    }
  }

  function unindex(group: RegisterGroup) {
    groupById.delete(group.parent.id);
    groupOf.delete(group.parent.id);
    for (const child of group.children) {
      groupOf.delete(child.id);
    }
  }

  function isRead(group: RegisterGroup) {
    return (
      read === 'all' || (read !== 'none' && group.parent.date >= read.from)
    );
  }

  function showsAny(field: 'payee' | 'category', ids: Set<string>) {
    for (const group of groups) {
      if (ids.has(group.parent[field] ?? '')) {
        return true;
      }
      for (const child of group.children) {
        if (ids.has(child[field] ?? '')) {
          return true;
        }
      }
    }
    return false;
  }

  function update(changes: Pending) {
    if (changes.all) {
      forget();
      return;
    }
    if (read === 'none') {
      // What's read next is read as it is now
      return;
    }
    if (
      (changes.payee.size > 0 && showsAny('payee', changes.payee)) ||
      (changes.category.size > 0 && showsAny('category', changes.category)) ||
      changes.transactions.size > maxChangedRows
    ) {
      forget();
      return;
    }
    if (changes.transactions.size === 0) {
      return;
    }

    // Each changed row's group where it was, and where it is now: a row can
    // become a child (a new split), stop being one, or be deleted
    const changed = [...changes.transactions];
    const affected = new Set<string>();
    for (const id of changed) {
      const group = groupOf.get(id);
      if (group != null) {
        affected.add(group);
      }
    }
    const { data: links } = runQuery(
      q('transactions')
        .filter({ id: { $oneof: changed } })
        .options({ splits: 'all' })
        .select(['id', 'parent_id']),
    );
    for (const link of links as Array<{ id: string; parent_id: string }>) {
      affected.add(link.parent_id ?? link.id);
    }
    if (affected.size === 0) {
      return;
    }

    const fresh = readGroups({ id: { $oneof: [...affected] } })
      // Groups not read yet are read as they are when their chunk is
      .filter(isRead)
      .sort((a, b) => compareRegisterOrder(a.parent, b.parent));

    if (affected.size > MAX_SPLICED_GROUPS) {
      const kept = groups.filter(group => !affected.has(group.parent.id));
      for (const id of affected) {
        const old = groupById.get(id);
        if (old) {
          unindex(old);
        }
      }
      for (const group of fresh) {
        index(group);
      }
      groups = mergeSorted(kept, fresh);
      groupsByAccount = null;
      return;
    }

    // A few groups: move them in copies of the lists, found by their order
    const nextGroups = groups.slice();
    const nextByAccount = groupsByAccount && new Map(groupsByAccount);
    const copied = new Set<string>();
    const accountList = (account: string) => {
      if (!nextByAccount) {
        return null;
      }
      if (!copied.has(account)) {
        copied.add(account);
        nextByAccount.set(account, [...(nextByAccount.get(account) ?? [])]);
      }
      return nextByAccount.get(account) ?? null;
    };
    for (const id of affected) {
      const old = groupById.get(id);
      if (old) {
        removeSorted(nextGroups, old);
        const list = accountList(old.parent.account);
        if (list) {
          removeSorted(list, old);
        }
        unindex(old);
      }
    }
    for (const group of fresh) {
      insertSorted(nextGroups, group);
      const list = accountList(group.parent.account);
      if (list) {
        insertSorted(list, group);
      }
      index(group);
    }
    for (const account of copied) {
      if (nextByAccount?.get(account)?.length === 0) {
        nextByAccount.delete(account);
      }
    }
    groups = nextGroups;
    groupsByAccount = nextByAccount;
  }

  // Apply the recorded changes, then read up to `limit` more groups (all
  // that are left without one). A failed read is thrown until a change
  // reads again.
  function run(limit: number | null) {
    const changes = pending;
    if (failure != null && !changes.all) {
      throw failure.error;
    }
    pending = noPending();
    try {
      update(changes);
      readChunk(limit);
      failure = null;
    } catch (error) {
      failure = { error: error as Error };
      forget();
      throw error;
    }
  }

  function getGroups() {
    if (
      read !== 'all' ||
      pending.all ||
      pending.transactions.size > 0 ||
      pending.payee.size > 0 ||
      pending.category.size > 0
    ) {
      run(null);
    }
    return groups;
  }

  return {
    getGroups,

    getGroupsByAccount() {
      const all = getGroups();
      if (!groupsByAccount) {
        groupsByAccount = new Map();
        for (const group of all) {
          const list = groupsByAccount.get(group.parent.account);
          if (list) {
            list.push(group);
          } else {
            groupsByAccount.set(group.parent.account, [group]);
          }
        }
      }
      return groupsByAccount;
    },

    loadSome() {
      if (read === 'all' && !pending.all) {
        return false;
      }
      try {
        run(chunkSize);
      } catch {
        // Thrown again when the rows are read
        return false;
      }
      return read !== 'all';
    },

    applyChanges(changes) {
      if (changes === 'all') {
        pending.all = true;
        dependencies = null;
        return true;
      }
      if (read === 'none' && failure == null) {
        // Nothing read yet: whatever is read next is current
        return false;
      }
      let isRelevant = false;
      for (const table of changes.tables) {
        if (
          failure == null &&
          dependencies != null &&
          !dependencies.includes(table)
        ) {
          continue;
        }
        isRelevant = true;
        const ids = changes.ids[table];
        const field = SHOWN_ID_TABLES[table];
        if (failure != null || ids == null) {
          pending.all = true;
        } else if (table === 'transactions') {
          for (const id of ids) {
            pending.transactions.add(id);
          }
        } else if (field) {
          for (const id of ids) {
            pending[field].add(id);
          }
        } else {
          pending.all = true;
        }
      }
      return isRelevant;
    },
  };
}

const NO_CHILDREN: readonly TransactionEntity[] = [];

// SQLite's order: NULLs before every value, and strings by code point
function compareValues(a: unknown, b: unknown): number {
  if (a == null || b == null) {
    return a == null ? (b == null ? 0 : -1) : 1;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return compareCodePoints(a, b);
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return Number(a) - Number(b);
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Compare strings as SQLite's default (BINARY) collation does. */
export function compareCodePoints(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    if (x !== y) {
      // UTF-16 orders surrogates (code points above U+FFFF) before
      // U+E000-U+FFFF; code points order them after
      const isSurrogateX = x >= 0xd800 && x <= 0xdfff;
      const isSurrogateY = y >= 0xd800 && y <= 0xdfff;
      if (isSurrogateX !== isSurrogateY && (x >= 0xe000 || y >= 0xe000)) {
        return isSurrogateX ? 1 : -1;
      }
      return x - y;
    }
  }
  return a.length - b.length;
}

/** One key of an order: a value to compare, and its direction. */
export type OrderKey<Row> = {
  value: (row: Row) => unknown;
  desc?: boolean;
};

/** Compare `a` and `b` by `keys`, as SQLite's ORDER BY does. */
export function compareByKeys<Row>(
  keys: ReadonlyArray<OrderKey<Row>>,
  a: Row,
  b: Row,
): number {
  for (const { value, desc } of keys) {
    // DESC reverses NULLs too: they come last
    const result = compareValues(value(a), value(b));
    if (result !== 0) {
      return desc ? -result : result;
    }
  }
  return 0;
}

// The transactions table's default order (see the schema's `customizeQuery`)
const REGISTER_ORDER: ReadonlyArray<OrderKey<TransactionEntity>> = [
  { value: t => t.date, desc: true },
  { value: t => t.starting_balance_flag },
  { value: t => t.sort_order, desc: true },
  { value: t => t.id },
];

/** Compare transactions in the register's default order. */
export function compareRegisterOrder(
  a: TransactionEntity,
  b: TransactionEntity,
): number {
  return compareByKeys(REGISTER_ORDER, a, b);
}

// `group`'s position in `list` (sorted in the register's order), by binary
// search: the first position whose group doesn't sort before it
function lowerBound(list: readonly RegisterGroup[], group: RegisterGroup) {
  let low = 0;
  let high = list.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compareRegisterOrder(list[middle].parent, group.parent) < 0) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function removeSorted(list: RegisterGroup[], group: RegisterGroup) {
  let index = lowerBound(list, group);
  while (index < list.length && list[index] !== group) {
    if (compareRegisterOrder(list[index].parent, group.parent) !== 0) {
      // Not where its order puts it (a list SQLite sorted slightly
      // differently): look for it
      index = list.indexOf(group);
      break;
    }
    index++;
  }
  if (index >= 0 && index < list.length) {
    list.splice(index, 1);
  }
}

function insertSorted(list: RegisterGroup[], group: RegisterGroup) {
  list.splice(lowerBound(list, group), 0, group);
}

function mergeSorted(
  sorted: readonly RegisterGroup[],
  others: readonly RegisterGroup[],
): RegisterGroup[] {
  if (others.length === 0) {
    return [...sorted];
  }
  const merged: RegisterGroup[] = [];
  let j = 0;
  for (const group of sorted) {
    while (
      j < others.length &&
      compareRegisterOrder(others[j].parent, group.parent) < 0
    ) {
      merged.push(others[j++]);
    }
    merged.push(group);
  }
  while (j < others.length) {
    merged.push(others[j++]);
  }
  return merged;
}
