import { Timestamp } from '@actual-app/crdt';

import { aqlQuery } from '#server/aql';
import { loadBudgetState } from '#server/budget/state';
import { generateBudget } from '#server/budget/test-helpers/generate-budget';
import * as db from '#server/db';
import { applyMessages, batchMessages } from '#server/sync';
import { batchUpdateTransactions } from '#server/transactions';
import { undo, withUndo } from '#server/undo';
import { q } from '#shared/query';
import type { Query } from '#shared/query';

import {
  createQueryCell,
  getQueryCellValue,
  releaseQueryCell,
} from './query-cells';

beforeEach(global.emptyDatabase());

// The shapes of the cells the app binds: sidebar and register balances, the
// uncategorized count, a category's month and the balance chart's start.
function boundQueries(): Record<string, Query> {
  const sum = (query: Query) => query.calculate({ $sum: '$amount' });
  const register = (filter: Record<string, unknown>) =>
    q('transactions').options({ splits: 'grouped' }).filter(filter);
  return {
    'register-checking': sum(register({ account: 'acct-checking' })),
    'register-checking-cleared': sum(
      register({ account: 'acct-checking' }).filter({ cleared: true }),
    ),
    'register-checking-uncleared-count': register({ account: 'acct-checking' })
      .filter({ cleared: false })
      .calculate({ $count: '$id' }),
    'register-offbudget': sum(
      register({
        $and: [{ 'account.offbudget': true }, { 'account.closed': false }],
      }),
    ),
    'register-closed': sum(register({ 'account.closed': true })),
    'register-new': sum(register({ account: 'acct-new' })),
    'checking-count': q('transactions')
      .filter({ account: 'acct-checking' })
      .options({ splits: 'none' })
      .calculate({ $count: '$id' }),
    'group-balance': sum(
      q('transactions')
        .filter({
          'account.account_group_id': 'group-a',
          'account.offbudget': false,
          'account.closed': false,
        })
        .options({ splits: 'none' }),
    ),
    'all-balance': sum(q('transactions').filter({ 'account.closed': false })),
    'onbudget-cleared': sum(
      q('transactions')
        .filter({
          'account.offbudget': false,
          'account.closed': false,
          cleared: true,
        })
        .options({ splits: 'none' }),
    ),
    'checking-cleared': sum(
      q('transactions')
        .filter({ account: 'acct-checking', cleared: true })
        .options({ splits: 'none' }),
    ),
    'invest-balance': sum(
      q('transactions')
        .filter({ account: 'acct-invest' })
        .options({ splits: 'none' }),
    ),
    'uncategorized-count': q('transactions')
      .filter({
        'account.offbudget': false,
        category: null,
        $or: [
          {
            'payee.transfer_acct.offbudget': true,
            'payee.transfer_acct': null,
          },
        ],
      })
      .calculate({ $count: '$id' }),
    'register-uncleared-count': q('transactions')
      .options({ splits: 'grouped' })
      .filter({ cleared: false })
      .calculate({ $count: '$id' }),
    'history-start': sum(
      q('transactions')
        .options({ splits: 'grouped' })
        .filter({ date: { $lt: '2021-06-01' } }),
    ),
    'category-month': sum(
      q('transactions').filter({
        category: 'cat-0-0',
        date: { $transform: '$month', $eq: '2021-03' },
      }),
    ),
  };
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
    db.runQuery(
      "INSERT INTO account_groups (id, name, tombstone) VALUES ('group-a', 'A', 0)",
    );
    db.runQuery(
      "UPDATE accounts SET account_group_id = 'group-a' WHERE id IN ('acct-checking', 'acct-savings')",
    );
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

    const update = (id: string, fields: Record<string, unknown>) => () =>
      db.update('transactions', { id, ...fields });
    const added = (
      id: string,
      amount: number,
      fields: Record<string, unknown> = {},
    ) => ({
      id,
      amount,
      account: 'acct-checking',
      date: '2021-03-10',
      ...fields,
    });

    const steps: Array<[string, () => unknown]> = [
      ['edit amount', update(plain, { amount: 1234 })],
      ['null amount', update(plain, { amount: null })],
      ['unclear', update(plain, { cleared: 0 })],
      ['change account', update(plain, { acct: 'acct-invest' })],
      ['change category', update(other, { category: null })],
      ['move date', update(other, { date: 20210315 })],
      ['no account', update(other, { acct: null })],
      [
        'add split',
        () =>
          batchUpdateTransactions({
            added: [
              added('split', -5000, { is_parent: true }),
              added('split-1', -2000, {
                category: 'cat-0-0',
                parent_id: 'split',
                is_child: true,
              }),
              added('split-2', -3000, {
                parent_id: 'split',
                is_child: true,
              }),
            ],
          }),
      ],
      // Children of a deleted parent drop out without changing themselves
      ['delete parent only', update(parent, { tombstone: 1 })],
      ['restore parent', update(parent, { tombstone: 0 })],
      ['move child', update(child, { parent_id: 'split' })],
      ['unsplit child', update(child, { isChild: 0 })],
      [
        'delete split',
        () => batchUpdateTransactions({ deleted: [{ id: 'split' }] }),
      ],
      [
        'transfer',
        () =>
          batchUpdateTransactions({
            added: [added('transfer', -7000, { payee: transferPayee })],
          }),
      ],
      [
        'delete transfer',
        () => batchUpdateTransactions({ deleted: [{ id: 'transfer' }] }),
      ],
      // Changes to other tables a cell reads run the cell in full
      [
        'payee and transaction',
        () =>
          batchMessages(() => {
            db.update('payees', { id: transferPayee, transfer_acct: null });
            update(plain, { description: transferPayee })();
          }),
      ],
      [
        'close account',
        () => db.update('accounts', { id: 'acct-savings', closed: 1 }),
      ],
      ['merge category', () => db.deleteCategory({ id: 'cat-0-0' }, 'cat-0-1')],
      [
        'move account off budget',
        () => db.update('accounts', { id: 'acct-card', offbudget: 1 }),
      ],
      [
        'move account to group',
        () =>
          db.update('accounts', {
            id: 'acct-card',
            account_group_id: 'group-a',
          }),
      ],
      [
        'delete account',
        () => db.update('accounts', { id: 'acct-invest', tombstone: 1 }),
      ],
      // Transactions that arrive before their account
      [
        'new account transactions',
        () =>
          batchUpdateTransactions({
            added: [
              added('new-1', 1500, { account: 'acct-new' }),
              added('new-2', 2500, { account: 'acct-new', cleared: false }),
            ],
          }),
      ],
      [
        'new account',
        () => db.insertAccount({ id: 'acct-new', name: 'New', offbudget: 1 }),
      ],
      [
        'undoable edits',
        () =>
          withUndo(async () =>
            batchUpdateTransactions({
              updated: [{ id: plain, amount: -4321, cleared: false }],
              deleted: [{ id: other }],
            }),
          ),
      ],
      ['undo', () => undo()],
      [
        'synced change',
        () =>
          applyMessages(
            [
              ['acct', 'acct-checking'],
              ['date', 20210320],
              ['amount', 999],
              ['cleared', 0],
            ].map(([column, value]) => ({
              dataset: 'transactions',
              row: 'synced',
              column: column as string,
              value,
              timestamp: Timestamp.send()!,
            })),
          ),
      ],
      [
        'large batch',
        () =>
          batchMessages(() => {
            for (const id of transactionIds({}, 1500)) {
              update(id, { amount: 100 })();
            }
          }),
      ],
    ];
    for (const [step, apply] of steps) {
      await apply();
      expectCurrent(step);
    }
  });

  it('binds balances again from the transaction totals', async () => {
    await generateBudget({ seed: 2, years: 1, transactionsPerMonth: 20 });
    await loadBudgetState();
    const balance = q('transactions')
      .filter({ account: 'acct-checking' })
      .options({ splits: 'none' })
      .calculate({ $sum: '$amount' })
      .serialize();
    createQueryCell('balance', balance);
    const value = getQueryCellValue('balance') as number;
    releaseQueryCell('balance', balance);

    // A write that skips sync isn't seen by the totals, so binding the balance
    // again shows it only if it ran its query
    db.runQuery(
      "UPDATE transactions SET amount = amount + 777 WHERE acct = 'acct-checking' AND isChild = 0",
    );
    createQueryCell('balance', balance);

    expect(getQueryCellValue('balance')).toBe(value);
  });

  it('adjust sums and counts by the changed rows', async () => {
    await generateBudget({ seed: 2, years: 1, transactionsPerMonth: 20 });
    await loadBudgetState();
    const query = q('transactions').calculate({ $sum: '$amount' });
    createQueryCell('balance', query.serialize());
    const balance = getQueryCellValue('balance') as number;

    // A write that skips sync isn't seen, so a full run would pick it up but
    // an update from the changed rows won't
    const [skipped, edited] = transactionIds(
      { is_parent: false, is_child: false, 'account.closed': false },
      2,
    );
    db.runQuery('UPDATE transactions SET amount = amount + 777 WHERE id = ?', [
      skipped,
    ]);
    const editedAmount = aqlQuery(
      q('transactions').filter({ id: edited }).select('amount'),
    ).data[0].amount;
    db.update('transactions', { id: edited, amount: editedAmount + 5 });

    expect(getQueryCellValue('balance')).toBe(balance + 5);
  });

  it('runs in full when the changed rows cannot be read', async () => {
    await generateBudget({ seed: 2, years: 1, transactionsPerMonth: 20 });
    await loadBudgetState();
    const query = q('transactions').calculate({ $sum: '$amount' });
    createQueryCell('balance', query.serialize());

    // A NUL can't be spliced into SQL text
    db.insertTransaction({
      id: 'bad\u0000id',
      account: 'acct-checking',
      date: '2021-03-10',
      amount: 1234,
    });

    expect(getQueryCellValue('balance')).toBe(aqlQuery(query).data);
  });
});
