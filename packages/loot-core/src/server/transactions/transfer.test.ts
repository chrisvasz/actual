// @ts-strict-ignore
import { expectSnapshotWithDiffer } from '#mocks/util';
import * as db from '#server/db';

import * as transfer from './transfer';

beforeEach(global.emptyDatabase());

function getAllTransactions() {
  return db.all<db.DbViewTransaction & { payee_name: db.DbPayee['name'] }>(
    `SELECT t.*, p.name as payee_name
       FROM v_transactions t
       LEFT JOIN payees p ON p.id = t.payee
       ORDER BY date DESC, amount DESC, id
     `,
  );
}

async function prepareDatabase() {
  db.insertCategoryGroup({ id: 'group1', name: 'group1', is_income: 0 });
  db.insertCategory({
    id: '1',
    name: 'cat1',
    cat_group: 'group1',
    is_income: 0,
  });
  db.insertAccount({ id: 'one', name: 'one' });
  db.insertAccount({ id: 'two', name: 'two' });
  db.insertAccount({ id: 'three', name: 'three', offbudget: 1 });
  db.insertPayee({ name: '', transfer_acct: 'one' });
  db.insertPayee({ name: '', transfer_acct: 'two' });
  db.insertPayee({
    name: '',
    transfer_acct: 'three',
  });
}

type Transaction = {
  account: string;
  amount: number;
  category?: string;
  date: string;
  id?: string;
  notes?: string;
  payee: string;
  transfer_id?: string;
  is_parent?: boolean;
  is_child?: boolean;
  parent_id?: string;
};

describe('Transfer', () => {
  test('transfers are properly inserted/updated/deleted', async () => {
    await prepareDatabase();

    let transaction: Transaction = {
      account: 'one',
      amount: 5000,
      payee: db.insertPayee({ name: 'Non-transfer' }),
      date: '2017-01-01',
    };
    db.insertTransaction(transaction);
    await transfer.onInsert(transaction);

    const differ = expectSnapshotWithDiffer(getAllTransactions());

    const transferTwo = db.first<db.DbPayee>(
      "SELECT * FROM payees WHERE transfer_acct = 'two'",
    );
    const transferThree = db.first<db.DbPayee>(
      "SELECT * FROM payees WHERE transfer_acct = 'three'",
    );

    transaction = {
      account: 'one',
      amount: 5000,
      payee: transferTwo.id,
      date: '2017-01-01',
    };
    transaction.id = db.insertTransaction(transaction);
    await transfer.onInsert(transaction);
    differ.expectToMatchDiff(getAllTransactions());

    // Fill the transaction out
    transaction = db.getTransaction(transaction.id);
    expect(transaction.transfer_id).toBeDefined();

    transaction = {
      ...transaction,
      date: '2017-01-05',
      notes: 'This is a note',
    };
    db.updateTransaction(transaction);
    await transfer.onUpdate(transaction);
    differ.expectToMatchDiff(getAllTransactions());

    transaction = {
      ...transaction,
      payee: transferThree.id,
    };
    db.updateTransaction(transaction);
    await transfer.onUpdate(transaction);
    differ.expectToMatchDiff(getAllTransactions());

    transaction = {
      ...transaction,
      payee: db.insertPayee({ name: 'Not transferred anymore' }),
    };
    db.updateTransaction(transaction);
    await transfer.onUpdate(transaction);
    differ.expectToMatchDiff(getAllTransactions());

    // Make sure it's not a linked transaction anymore
    transaction = db.getTransaction(transaction.id);
    expect(transaction.transfer_id).toBeNull();

    // Re-transfer it
    transaction = {
      ...transaction,
      payee: transferTwo.id,
    };
    db.updateTransaction(transaction);
    await transfer.onUpdate(transaction);
    differ.expectToMatchDiff(getAllTransactions());

    transaction = db.getTransaction(transaction.id);
    expect(transaction.transfer_id).toBeDefined();

    db.deleteTransaction(transaction);
    transfer.onDelete(transaction);
    differ.expectToMatchDiff(getAllTransactions());
  });

  test('transfers are properly de-categorized', async () => {
    await prepareDatabase();

    const transferTwo = db.first<db.DbPayee>(
      "SELECT * FROM payees WHERE transfer_acct = 'two'",
    );
    const transferThree = db.first<db.DbPayee>(
      "SELECT * FROM payees WHERE transfer_acct = 'three'",
    );

    let transaction: Transaction = {
      account: 'one',
      amount: 5000,
      payee: db.insertPayee({ name: 'Non-transfer' }),
      date: '2017-01-01',
      category: '1',
    };
    transaction.id = db.insertTransaction(transaction);
    await transfer.onInsert(transaction);

    const differ = expectSnapshotWithDiffer(getAllTransactions());

    transaction = {
      ...db.getTransaction(transaction.id),
      payee: transferThree.id,
      notes: 'hi',
    };
    db.updateTransaction(transaction);
    await transfer.onUpdate(transaction);
    differ.expectToMatchDiff(getAllTransactions());

    transaction = {
      ...db.getTransaction(transaction.id),
      payee: transferTwo.id,
    };
    db.updateTransaction(transaction);
    await transfer.onUpdate(transaction);
    differ.expectToMatchDiff(getAllTransactions());
  });

  test('split transfers are retained on child transactions', async () => {
    // test: first add a txn having a transfer acct payee
    // then mark it as `is_parent` and add a child txn
    // the child txn should have a different transfer acct payee
    // and `is_child` set to true
    await prepareDatabase();

    const transferOne = db.first<db.DbPayee>(
      "SELECT * FROM payees WHERE transfer_acct = 'one'",
    );
    const transferTwo = db.first<db.DbPayee>(
      "SELECT * FROM payees WHERE transfer_acct = 'two'",
    );

    let parent: Transaction = {
      account: 'one',
      amount: 5000,
      payee: transferTwo.id,
      date: '2017-01-01',
    };
    parent.id = db.insertTransaction(parent);
    await transfer.onInsert(parent);
    parent = db.getTransaction(parent.id);

    const differ = expectSnapshotWithDiffer(getAllTransactions());

    // mark the txn as parent
    db.updateTransaction({ id: parent.id, is_parent: true });
    await transfer.onUpdate(parent);
    differ.expectToMatchDiff(getAllTransactions());

    // add a child txn
    let child: Transaction = {
      account: 'one',
      amount: 2000,
      payee: transferOne.id,
      date: '2017-01-01',
      is_child: true,
      parent_id: parent.id,
    };
    child.id = db.insertTransaction(child);
    await transfer.onInsert(child);
    differ.expectToMatchDiff(getAllTransactions());

    // ensure that the child txn has the correct transfer acct payee
    child = db.getTransaction(child.id);
    expect(child.transfer_id).not.toBe(parent.transfer_id);
    expect(child.payee).toBe(transferOne.id);
  });
});
