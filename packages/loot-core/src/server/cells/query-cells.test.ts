import { aqlQuery } from '#server/aql';
import { loadBudgetState } from '#server/budget/state';
import { generateBudget } from '#server/budget/test-helpers/generate-budget';
import * as db from '#server/db';
import { batchMessages } from '#server/sync';
import { batchUpdateTransactions } from '#server/transactions';
import { q } from '#shared/query';
import type { Query } from '#shared/query';

import { createQueryCell, getQueryCellValue } from './query-cells';

beforeEach(global.emptyDatabase());

// The shapes of the cells the app binds: sidebar and register balances, the
// uncategorized count, a category's month and the balance chart's start.
function boundQueries(): Record<string, Query> {
  const uncategorized = q('transactions').filter({
    'account.offbudget': false,
    category: null,
    $or: [
      { 'payee.transfer_acct.offbudget': true, 'payee.transfer_acct': null },
    ],
  });
  const queries: Record<string, Query> = {
    'all-balance': q('transactions')
      .filter({ 'account.closed': false })
      .calculate({ $sum: '$amount' }),
    'all-cleared': q('transactions')
      .filter({ 'account.closed': false, cleared: true })
      .options({ splits: 'none' })
      .calculate({ $sum: '$amount' }),
    'onbudget-cleared': q('transactions')
      .filter({
        'account.offbudget': false,
        'account.closed': false,
        cleared: true,
      })
      .options({ splits: 'none' })
      .calculate({ $sum: '$amount' }),
    'uncategorized-count': uncategorized.calculate({ $count: '$id' }),
    'uncategorized-balance': uncategorized.calculate({ $sum: '$amount' }),
    'register-all': q('transactions')
      .options({ splits: 'grouped' })
      .calculate({ $sum: '$amount' }),
    'register-uncleared-count': q('transactions')
      .options({ splits: 'grouped' })
      .filter({ cleared: false })
      .calculate({ $count: '$id' }),
    'history-start': q('transactions')
      .options({ splits: 'grouped' })
      .filter({ date: { $lt: '2021-06-01' } })
      .calculate({ $sum: '$amount' }),
    'category-month': q('transactions')
      .filter({
        category: 'cat-0-0',
        date: { $transform: '$month', $eq: '2021-03' },
      })
      .options({ splits: 'inline' })
      .calculate({ $sum: '$amount' }),
    // Not a sum of a plain field, so always runs in full
    'all-abs': q('transactions').calculate({ $sum: { $abs: '$amount' } }),
  };
  for (const account of [
    'acct-checking',
    'acct-savings',
    'acct-invest',
    'acct-closed',
  ]) {
    queries[`balance-${account}`] = q('transactions')
      .filter({ account })
      .options({ splits: 'none' })
      .calculate({ $sum: '$amount' });
    queries[`cleared-${account}`] = q('transactions')
      .filter({ account, cleared: true })
      .options({ splits: 'none' })
      .calculate({ $sum: '$amount' });
  }
  return queries;
}

function transactionIds(filter: Record<string, unknown>, limit: number) {
  return (
    aqlQuery(
      q('transactions')
        .filter(filter)
        .options({ splits: 'all' })
        .select('id')
        .limit(limit),
    ).data as Array<{ id: string }>
  ).map(row => row.id);
}

describe('query cells', () => {
  it('stay equal to running their query after each change', async () => {
    await generateBudget({ seed: 2, years: 2, transactionsPerMonth: 60 });
    await loadBudgetState();

    const queries = boundQueries();
    for (const [name, query] of Object.entries(queries)) {
      createQueryCell(name, query.serialize());
    }
    const expectCurrent = (step: string) => {
      for (const [name, query] of Object.entries(queries)) {
        expect([step, name, getQueryCellValue(name)]).toEqual([
          step,
          name,
          aqlQuery(query).data,
        ]);
      }
    };
    expectCurrent('initial');

    const [plain, other] = transactionIds(
      { is_parent: false, is_child: false, 'account.closed': false },
      2,
    );
    const [parent] = transactionIds({ is_parent: true }, 1);
    const [child] = transactionIds({ is_child: true }, 1);
    // A transfer looks up both accounts' transfer payees
    db.insertPayee({ name: '', transfer_acct: 'acct-checking' });
    const transferPayee = db.insertPayee({
      name: '',
      transfer_acct: 'acct-invest',
    });

    const steps: Array<[string, () => unknown]> = [
      [
        'edit amount',
        () => db.update('transactions', { id: plain, amount: 1234 }),
      ],
      [
        'null amount',
        () => db.update('transactions', { id: plain, amount: null }),
      ],
      ['clear', () => db.update('transactions', { id: plain, cleared: 0 })],
      [
        'change account',
        () => db.update('transactions', { id: plain, acct: 'acct-invest' }),
      ],
      [
        'change category',
        () => db.update('transactions', { id: other, category: null }),
      ],
      [
        'move date',
        () => db.update('transactions', { id: other, date: 20210315 }),
      ],
      [
        'no account',
        () => db.update('transactions', { id: other, acct: null }),
      ],
      [
        'add split',
        () =>
          batchUpdateTransactions({
            added: [
              {
                id: 'split-parent',
                account: 'acct-checking',
                date: '2021-03-10',
                amount: -5000,
                is_parent: true,
              },
              {
                id: 'split-child-1',
                account: 'acct-checking',
                date: '2021-03-10',
                amount: -2000,
                category: 'cat-0-0',
                parent_id: 'split-parent',
                is_child: true,
              },
              {
                id: 'split-child-2',
                account: 'acct-checking',
                date: '2021-03-10',
                amount: -3000,
                parent_id: 'split-parent',
                is_child: true,
              },
            ],
          }),
      ],
      // Children of a deleted parent drop out without changing themselves
      [
        'delete parent only',
        () => db.update('transactions', { id: parent, tombstone: 1 }),
      ],
      [
        'restore parent',
        () => db.update('transactions', { id: parent, tombstone: 0 }),
      ],
      [
        'move child',
        () =>
          db.update('transactions', { id: child, parent_id: 'split-parent' }),
      ],
      [
        'unsplit child',
        () => db.update('transactions', { id: child, isChild: 0 }),
      ],
      [
        'delete split',
        () => batchUpdateTransactions({ deleted: [{ id: 'split-parent' }] }),
      ],
      [
        'transfer',
        () =>
          batchUpdateTransactions({
            added: [
              {
                id: 'transfer',
                account: 'acct-checking',
                date: '2021-04-01',
                amount: -7000,
                payee: transferPayee,
              },
            ],
          }),
      ],
      [
        'transfer amount',
        () =>
          batchUpdateTransactions({
            updated: [{ id: 'transfer', amount: -9000 }],
          }),
      ],
      [
        'delete transfer',
        () => batchUpdateTransactions({ deleted: [{ id: 'transfer' }] }),
      ],
      // Changes to other tables a cell reads run the cell in full
      [
        'payee becomes a transfer',
        () =>
          batchMessages(() => {
            db.update('payees', { id: transferPayee, transfer_acct: null });
            db.update('transactions', {
              id: plain,
              description: transferPayee,
            });
          }),
      ],
      [
        'close account',
        () => db.update('accounts', { id: 'acct-savings', closed: 1 }),
      ],
      ['merge category', () => db.deleteCategory({ id: 'cat-0-0' }, 'cat-0-1')],
      [
        'large batch',
        () =>
          batchMessages(() => {
            for (const id of transactionIds({}, 1500)) {
              db.update('transactions', { id, amount: 100 });
            }
          }),
      ],
    ];
    for (const [step, apply] of steps) {
      await apply();
      expectCurrent(step);
    }
  });
});
