// @ts-strict-ignore
import * as db from '#server/db';

import * as transfer from './transfer';

beforeEach(global.emptyDatabase());

async function prepareDatabase() {
  db.insertAccount({ id: 'one', name: 'one' });
  db.insertAccount({ id: 'two', name: 'two' });
  db.insertPayee({ name: '', transfer_acct: 'one' });
  db.insertPayee({ name: '', transfer_acct: 'two' });
}

async function createTransaction(account: string, amount: number, extra = {}) {
  const transaction = {
    id: null,
    account,
    amount,
    payee: db.insertPayee({ name: 'Non-transfer ' + account }),
    date: '2017-01-01',
    ...extra,
  };
  transaction.id = db.insertTransaction(transaction);
  return db.getTransaction(transaction.id);
}

describe('Transfer', () => {
  test('Transfers are properly verified', async () => {
    await prepareDatabase();

    // happy path, two valid transactions
    expect(
      transfer.validForTransfer(
        await createTransaction('one', 5),
        await createTransaction('two', -5),
      ),
    ).toBeTruthy();

    // amount not zeroed out
    expect(
      transfer.validForTransfer(
        await createTransaction('one', 5),
        await createTransaction('two', 5),
      ),
    ).toBeFalsy();

    // amount not match
    expect(
      transfer.validForTransfer(
        await createTransaction('one', 5),
        await createTransaction('two', -6),
      ),
    ).toBeFalsy();

    // accounts match
    expect(
      transfer.validForTransfer(
        await createTransaction('one', 5),
        await createTransaction('one', -5),
      ),
    ).toBeFalsy();

    // one already a transfer
    const existingTransfer = await createTransaction('one', 5);
    expect(
      transfer.validForTransfer(
        await createTransaction('one', 5),
        await createTransaction('two', -5, {
          transfer_id: existingTransfer.id,
        }),
      ),
    ).toBeFalsy();
  });
});
