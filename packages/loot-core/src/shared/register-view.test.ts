// The register's scopes, search and sort in JS, against the SQL queries
// the register ran for them before its rows were kept in memory.
import { isValid as isDateValid, parse as parseDate } from 'date-fns';

import { aqlQuery } from '#server/aql';
import {
  generateBudget,
  seededRandom,
} from '#server/budget/test-helpers/generate-budget';
import * as db from '#server/db';
import type { TransactionEntity } from '#types/models';

import {
  dayFromDate,
  getDayMonthFormat,
  getDayMonthRegex,
  getShortYearFormat,
  getShortYearRegex,
} from './months';
import { getNormalisedString } from './normalisation';
import { q } from './query';
import type { Query } from './query';
import { createRegisterRows } from './register-rows';
import type { RegisterGroup } from './register-rows';
import {
  flattenGroups,
  makeSearchMatcher,
  matchGroups,
  runningBalances,
  scopeGroups,
  sortGroups,
} from './register-view';
import type {
  RegisterLookups,
  RegisterScope,
  RegisterSort,
} from './register-view';
import { amountToInteger, currencyToAmount } from './util';

beforeEach(global.emptyDatabase());

const DATE_FORMAT = 'MM/dd/yyyy';

function run(query: Query) {
  return aqlQuery(query) as { data: unknown; dependencies: string[] };
}

// What a `splits: grouped` query reads, in the store's shape
function readGroups(query: Query): RegisterGroup[] {
  const { data } = run(query.select('*'));
  return (data as TransactionEntity[]).map(
    ({ subtransactions, ...parent }) => ({
      parent,
      children: subtransactions ?? [],
    }),
  );
}

// desktop-client's `queries.transactions`
function scopeQuery(scope: RegisterScope) {
  const query = q('transactions').options({ splits: 'grouped' });
  switch (scope) {
    case undefined:
      return query;
    case 'onbudget':
      return query.filter({
        $and: [{ 'account.offbudget': false }, { 'account.closed': false }],
      });
    case 'offbudget':
      return query.filter({
        $and: [{ 'account.offbudget': true }, { 'account.closed': false }],
      });
    case 'closed':
      return query.filter({ 'account.closed': true });
    case 'uncategorized':
      return query.filter({
        'account.offbudget': false,
        category: null,
        is_parent: false,
        $or: [
          {
            'payee.transfer_acct.offbudget': true,
            'payee.transfer_acct': null,
          },
        ],
      });
    default:
      return query.filter({ account: scope });
  }
}

// desktop-client's `queries.transactionsSearch`, which names are matched
// against in JS and notes in SQL
function searchQuery(
  query: Query,
  search: string,
  {
    payees,
    categories,
    accounts,
  }: {
    payees: Array<{ id: string; name: string }>;
    categories: Array<{ id: string; name: string }>;
    accounts: Array<{ id: string; name: string }>;
  },
) {
  const amount = currencyToAmount(search);
  const escapedSearch = search.replace(/[\\%?]/g, '\\$&');

  let parsedDate;
  if (getDayMonthRegex(DATE_FORMAT).test(search)) {
    parsedDate = parseDate(search, getDayMonthFormat(DATE_FORMAT), new Date());
  } else if (getShortYearRegex(DATE_FORMAT).test(search)) {
    parsedDate = parseDate(search, getShortYearFormat(DATE_FORMAT), new Date());
  } else {
    parsedDate = parseDate(search, DATE_FORMAT, new Date());
  }

  const term = getNormalisedString(search);
  const matchingIds = (items: Array<{ id: string; name: string }>) =>
    items
      .filter(item => getNormalisedString(item.name ?? '').includes(term))
      .map(item => item.id);
  const payeeIds = matchingIds(payees);
  const categoryIds = matchingIds(categories);
  const accountIds = matchingIds(accounts);

  return query.filter({
    $or: [
      payeeIds.length > 0 && { payee: { $oneof: payeeIds } },
      categoryIds.length > 0 && { category: { $oneof: categoryIds } },
      accountIds.length > 0 && { account: { $oneof: accountIds } },
      { notes: { $like: `%${escapedSearch}%` } },
      isDateValid(parsedDate) && { date: dayFromDate(parsedDate) },
      amount != null && {
        amount: { $transform: '$abs', $eq: amountToInteger(amount) },
      },
      amount != null &&
        Number.isInteger(amount) && {
          amount: {
            $transform: { $abs: { $idiv: ['$', 100] } },
            $eq: amount,
          },
        },
    ].filter(Boolean),
  });
}

// The register's sorted query (`applySort` in desktop-client's Account)
function sortQuery(query: Query, sort: RegisterSort) {
  const field = (name: string) =>
    ({
      account: 'account.name',
      payee: 'payee.name',
      category: 'category.name',
      payment: 'amount',
      deposit: 'amount',
    })[name] ?? name;
  const orderBy = (sorted: Query, name: string, dir?: 'asc' | 'desc') => {
    const column = field(name);
    if (column === 'cleared') {
      sorted = sorted.orderBy({ reconciled: dir });
    }
    return sorted.orderBy({ [column]: dir });
  };
  let sorted = orderBy(query, sort.field, sort.ascDesc);
  sorted = orderBy(sorted, sort.prevField ?? 'date', sort.prevAscDesc);
  return sorted.orderBy({ sort_order: sort.ascDesc });
}

const PAYEE_NAMES = [
  'Café Müller',
  'CAFE müller',
  'Łódź Market',
  'Straße 5',
  '100% Juice',
  'What? Store',
  'Back\\slash',
  'Under_score',
  'Ünïcödé',
  'Grocer',
];
const NOTES = [
  'memo café',
  'MEMO CAFE',
  '50% off',
  'why? because',
  'C:\\path',
  'a_b',
  'Łódź trip',
  'ß sharp',
  '',
  null,
];

async function setUpBudget() {
  await generateBudget({ seed: 7, years: 1, transactionsPerMonth: 40 });
  const random = seededRandom(8);
  const payees = PAYEE_NAMES.map(name => db.insertPayee({ name }));
  for (const account of db.getAccounts()) {
    payees.push(
      db.insertPayee({ name: '', transfer_acct: account.id }) as string,
    );
  }
  // A payee merged into another, and one deleted
  db.mergePayees(payees[0], [payees[1]]);
  db.deletePayee({ id: payees[9] });

  const ids = db
    .runQuery<{ id: string }>('SELECT id FROM transactions', [], true)
    .map(row => row.id);
  db.transaction(() => {
    for (const id of ids) {
      db.runQuery(
        'UPDATE transactions SET description = ?, notes = ?, cleared = ?, reconciled = ? WHERE id = ?',
        [
          random.chance(0.05) ? null : random.pick(payees),
          random.pick(NOTES),
          random.chance(0.5) ? 1 : 0,
          random.chance(0.3) ? 1 : 0,
          id,
        ],
      );
    }
  });

  const accounts = db.getAccounts();
  const payeeRows = db.getPayees();
  const categories = db.getCategoriesGrouped().flatMap(g => g.categories);
  const lookups: RegisterLookups = {
    accounts: new Map(accounts.map(a => [a.id, a])),
    payees: new Map(
      payeeRows.map(p => [
        p.id,
        { name: p.name, transfer_acct: p.transfer_acct ?? undefined },
      ]),
    ),
    categories: new Map(categories.map(c => [c.id, c])),
  };
  return {
    lookups,
    lists: { accounts, payees: payeeRows, categories },
    groups: createRegisterRows(run).getGroups(),
  };
}

const SCOPES: RegisterScope[] = [
  undefined,
  'acct-checking',
  'acct-savings',
  'acct-invest',
  'acct-closed',
  'onbudget',
  'offbudget',
  'closed',
  'uncategorized',
];

describe('scopeGroups', () => {
  it("shows what each scope's query reads", async () => {
    const { lookups, groups } = await setUpBudget();

    for (const scope of SCOPES) {
      const sql = readGroups(scopeQuery(scope));
      expect({ scope, groups: scopeGroups(groups, scope, lookups) }).toEqual({
        scope,
        groups: sql,
      });
    }
    // The uncategorized view marks the rows of a split it doesn't match
    expect(
      flattenGroups(scopeGroups(groups, 'uncategorized', lookups)).some(
        row => row._unmatched,
      ),
    ).toBe(true);
  });
});

describe('makeSearchMatcher', () => {
  it('matches what the search query matched', async () => {
    const { lookups, lists, groups } = await setUpBudget();
    const sample = flattenGroups(groups).find(
      row => !row.is_parent && row.amount % 100 !== 0,
    ) as TransactionEntity;
    const [year, month, day] = sample.date.split('-');
    const amount = Math.abs(sample.amount) / 100;

    const terms = [
      'cafe',
      'CAFÉ',
      'müller',
      'lodz',
      'łódź',
      'strasse',
      'ß',
      '%',
      '100%',
      '?',
      'what?',
      '\\',
      'back\\s',
      '_',
      'a_b',
      'memo cafe',
      ' ',
      'acct-sav',
      'acct',
      'cat-1',
      'income',
      'zzzz-no-match',
      String(amount),
      `-${amount}`,
      String(Math.trunc(amount)),
      '1,000.50',
      `${month}/${day}/${year}`,
      `${month}/${day}`,
      `${month}/${day}/${year.slice(2)}`,
      '13/45/2020',
    ];

    let matched = 0;
    for (const scope of [undefined, 'acct-checking', 'uncategorized']) {
      const scoped = scopeGroups(groups, scope, lookups);
      for (const term of terms) {
        const sql = readGroups(searchQuery(scopeQuery(scope), term, lists));
        const js = matchGroups(
          scoped,
          makeSearchMatcher(term, DATE_FORMAT, lookups),
        );
        expect({ scope, term, groups: js }).toEqual({
          scope,
          term,
          groups: sql,
        });
        matched += js.length;
      }
    }
    expect(matched).toBeGreaterThan(1000);
  });
});

describe('sortGroups', () => {
  it('orders rows as the sorted query did', async () => {
    const { lookups, groups } = await setUpBudget();
    const fields = [
      'date',
      'account',
      'payee',
      'notes',
      'category',
      'payment',
      'deposit',
      'cleared',
    ];
    const sorts: RegisterSort[] = fields.flatMap(field => [
      { field, ascDesc: 'asc' },
      { field, ascDesc: 'desc' },
      { field, ascDesc: 'asc', prevField: 'payee', prevAscDesc: 'desc' },
      { field, ascDesc: 'desc', prevField: 'cleared', prevAscDesc: 'asc' },
    ]);

    for (const scope of [undefined, 'acct-checking', 'uncategorized']) {
      const scoped = scopeGroups(groups, scope, lookups);
      for (const sort of sorts) {
        expect({
          scope,
          sort,
          groups: sortGroups(scoped, sort, lookups),
        }).toEqual({
          scope,
          sort,
          groups: readGroups(sortQuery(scopeQuery(scope), sort)),
        });
      }
    }
  });
});

describe('runningBalances', () => {
  it('sums each group and every group below it', () => {
    const group = (id: string, amount: number) => ({
      parent: { id, amount } as TransactionEntity,
      children: [{ id: `${id}-child`, amount } as TransactionEntity],
    });

    expect(
      runningBalances([group('a', 5), group('b', -2), group('c', 10)]),
    ).toEqual(
      new Map([
        ['c', 10],
        ['b', 8],
        ['a', 13],
      ]),
    );
  });
});
