import { isValid as isDateValid, parse as parseDate } from 'date-fns';

import type {
  AccountEntity,
  CategoryEntity,
  PayeeEntity,
  TransactionEntity,
} from '#types/models';

import { likePatternToRegex } from './like';
import {
  dayFromDate,
  getDayMonthFormat,
  getDayMonthRegex,
  getShortYearFormat,
  getShortYearRegex,
} from './months';
import { getNormalisedString } from './normalisation';
import { compareByKeys } from './register-rows';
import type { OrderKey, RegisterGroup } from './register-rows';
import { amountToInteger, currencyToAmount } from './util';

// What an account register shows of the rows in memory (`register-rows`):
// its scope, search, sort and running balances, worked out in JS the way
// the SQL queries the register used to run work them out.
//
// Rows a split shows without matching (a scope or search matching only some
// of a split's rows) are marked `_unmatched`, like a `splits: grouped`
// query marks them. Marking copies the row: the rows in memory are shared.

/** The register for an account, or one of the combined views. */
export type RegisterScope =
  | AccountEntity['id']
  | 'onbudget'
  | 'offbudget'
  | 'closed'
  | 'uncategorized'
  | undefined;

/** The names and flags the rows refer to, by id: the open budget's own. */
export type RegisterLookups = {
  accounts: ReadonlyMap<
    AccountEntity['id'],
    Pick<AccountEntity, 'name' | 'offbudget' | 'closed'>
  >;
  payees: ReadonlyMap<
    PayeeEntity['id'],
    Pick<PayeeEntity, 'name' | 'transfer_acct'>
  >;
  categories: ReadonlyMap<CategoryEntity['id'], Pick<CategoryEntity, 'name'>>;
};

/** A register's sort, as the column headers set it. */
export type RegisterSort = {
  field: string;
  ascDesc: 'asc' | 'desc';
  prevField?: string | undefined;
  prevAscDesc?: 'asc' | 'desc' | undefined;
};

// A boolean column compared in SQL: NULL is neither
function isTrue(value: unknown) {
  return value === true || value === 1;
}

function isFalse(value: unknown) {
  return value === false || value === 0;
}

/**
 * The filter on split parents and standalone transactions that reads
 * `scope`'s rows (desktop-client's `accountFilter`): an account's, or the
 * combined views', by its account's flags. A split's children share its
 * account. The uncategorized view reads the on-budget rows, then
 * `scopeGroups` keeps the splits it shows.
 */
export function registerFilter(
  scope: RegisterScope,
): Record<string, unknown> | null {
  switch (scope) {
    case undefined:
      return null;
    case 'onbudget':
      return {
        $and: [{ 'account.offbudget': false }, { 'account.closed': false }],
      };
    case 'offbudget':
      return {
        $and: [{ 'account.offbudget': true }, { 'account.closed': false }],
      };
    case 'closed':
      return { 'account.closed': true };
    case 'uncategorized':
      return { 'account.offbudget': false };
    default:
      return { account: scope };
  }
}

/**
 * The groups `scope` shows, of the rows `registerFilter` read for it. The
 * uncategorized view shows splits with any uncategorized row, with their
 * other rows unmatched; every other scope shows them all.
 */
export function scopeGroups(
  groups: readonly RegisterGroup[],
  scope: RegisterScope,
  { accounts, payees }: RegisterLookups,
): readonly RegisterGroup[] {
  if (scope !== 'uncategorized') {
    return groups;
  }
  // An account's flags as a join reads them: NULL for a deleted account
  const flag = (id: string, name: 'offbudget' | 'closed') =>
    accounts.get(id)?.[name];
  return matchGroups(groups, row => {
    if (
      !isFalse(flag(row.account, 'offbudget')) ||
      row.category != null ||
      row.is_parent
    ) {
      return false;
    }
    // Not a transfer, or one to an off-budget account
    const transferAccount = payees.get(row.payee ?? '')?.transfer_acct;
    return (
      transferAccount == null || isTrue(flag(transferAccount, 'offbudget'))
    );
  });
}

/**
 * The groups with a row that `isMatch` (and isn't already unmatched), with
 * their other rows marked unmatched.
 */
export function matchGroups(
  groups: readonly RegisterGroup[],
  isMatch: (row: TransactionEntity) => boolean,
): RegisterGroup[] {
  const matched: RegisterGroup[] = [];
  const matches = (row: TransactionEntity) => !row._unmatched && isMatch(row);
  const mark = (row: TransactionEntity, isMatched: boolean) =>
    isMatched || row._unmatched ? row : { ...row, _unmatched: true };

  for (const group of groups) {
    const isParentMatched = matches(group.parent);
    const childMatches = group.children.map(matches);
    if (!isParentMatched && !childMatches.includes(true)) {
      continue;
    }
    if (isParentMatched && !childMatches.includes(false)) {
      matched.push(group);
      continue;
    }
    matched.push({
      parent: mark(group.parent, isParentMatched),
      children: group.children.map((child, i) => mark(child, childMatches[i])),
    });
  }
  return matched;
}

const normalisedNotes = new WeakMap<TransactionEntity, string>();

// A row's notes as SQL's `NORMALISE` gives them to a LIKE, cached: rows in
// memory don't change
function getNormalisedNotes(row: TransactionEntity) {
  let notes = normalisedNotes.get(row);
  if (notes == null) {
    notes = row.notes ? getNormalisedString(row.notes) : '';
    normalisedNotes.set(row, notes);
  }
  return notes;
}

/**
 * Whether a row matches the register's search for `search`: its payee's,
 * category's or account's name contains it (ignoring case and accents), so
 * do its notes, or it is the row's date (in `dateFormat`), or amount.
 */
export function makeSearchMatcher(
  search: string,
  dateFormat: string,
  { accounts, payees, categories }: RegisterLookups,
): (row: TransactionEntity) => boolean {
  const amount = currencyToAmount(search);

  // Support various date formats
  let parsedDate;
  if (getDayMonthRegex(dateFormat).test(search)) {
    parsedDate = parseDate(search, getDayMonthFormat(dateFormat), new Date());
  } else if (getShortYearRegex(dateFormat).test(search)) {
    parsedDate = parseDate(search, getShortYearFormat(dateFormat), new Date());
  } else {
    parsedDate = parseDate(search, dateFormat, new Date());
  }
  const date = isDateValid(parsedDate) ? dayFromDate(parsedDate) : null;

  // A transfer payee's name is its account's name
  const term = getNormalisedString(search);
  const matchingIds = (
    items: ReadonlyMap<string, { name: string | null | undefined }>,
  ) => {
    const ids = new Set<string>();
    for (const [id, { name }] of items) {
      if (getNormalisedString(name ?? '').includes(term)) {
        ids.add(id);
      }
    }
    return ids;
  };
  const payeeIds = matchingIds(payees);
  const categoryIds = matchingIds(categories);
  const accountIds = matchingIds(accounts);

  const notes = likePatternToRegex(
    getNormalisedString(`%${search.replace(/[\\%?]/g, '\\$&')}%`),
  );
  const integerAmount = amount != null ? amountToInteger(amount) : null;
  const wholeAmount =
    amount != null && Number.isInteger(amount) ? amount : null;

  return row =>
    payeeIds.has(row.payee ?? '') ||
    categoryIds.has(row.category ?? '') ||
    accountIds.has(row.account) ||
    notes.test(getNormalisedNotes(row)) ||
    (date != null && row.date === date) ||
    (integerAmount != null && Math.abs(row.amount) === integerAmount) ||
    // Integer division in SQL truncates
    (wholeAmount != null &&
      Math.abs(Math.trunc(row.amount / 100)) === wholeAmount);
}

function sortKeys(
  field: string,
  ascDesc: 'asc' | 'desc' | undefined,
  { accounts, payees, categories }: RegisterLookups,
): Array<OrderKey<TransactionEntity>> {
  const desc = ascDesc === 'desc';
  switch (field) {
    case 'account':
      return [{ value: t => accounts.get(t.account)?.name ?? null, desc }];
    case 'payee':
      return [{ value: t => payees.get(t.payee ?? '')?.name ?? null, desc }];
    case 'category':
      return [
        { value: t => categories.get(t.category ?? '')?.name ?? null, desc },
      ];
    case 'payment':
    case 'deposit':
      return [{ value: t => t.amount, desc }];
    case 'cleared':
      // Reconciled rows sort with the cleared
      return [
        { value: t => t.reconciled, desc },
        { value: t => t.cleared, desc },
      ];
    default:
      return [
        { value: t => (t as Record<string, unknown>)[field] ?? null, desc },
      ];
  }
}

/**
 * The groups sorted by `sort`, and each split's rows too: by the column,
 * then the previous column (the date, ascending, before there is one), then
 * the order transactions were added in, as the register's sorted query
 * orders them.
 */
export function sortGroups(
  groups: readonly RegisterGroup[],
  sort: RegisterSort,
  lookups: RegisterLookups,
): RegisterGroup[] {
  const keys: Array<OrderKey<TransactionEntity>> = [
    ...sortKeys(sort.field, sort.ascDesc, lookups),
    ...sortKeys(sort.prevField ?? 'date', sort.prevAscDesc, lookups),
    { value: t => t.sort_order, desc: sort.ascDesc === 'desc' },
    { value: t => t.id },
  ];
  const compare = (a: TransactionEntity, b: TransactionEntity) =>
    compareByKeys(keys, a, b);
  return [...groups]
    .sort((a, b) => compare(a.parent, b.parent))
    .map(group =>
      group.children.length > 1
        ? { ...group, children: [...group.children].sort(compare) }
        : group,
    );
}

/**
 * Each group's running balance, in the order shown: its amount and every
 * amount below it.
 */
export function runningBalances(
  groups: readonly RegisterGroup[],
): Map<TransactionEntity['id'], number> {
  const balances = new Map<TransactionEntity['id'], number>();
  let balance = 0;
  for (let i = groups.length - 1; i >= 0; i--) {
    balance += groups[i].parent.amount;
    balances.set(groups[i].parent.id, balance);
  }
  return balances;
}

/** The groups' rows, each split's parent followed by its children. */
export function flattenGroups(
  groups: readonly RegisterGroup[],
): TransactionEntity[] {
  const rows: TransactionEntity[] = [];
  for (const group of groups) {
    rows.push(group.parent);
    for (const child of group.children) {
      rows.push(child);
    }
  }
  return rows;
}
