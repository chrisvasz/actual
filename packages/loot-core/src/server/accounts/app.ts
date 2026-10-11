import { v4 as uuidv4 } from 'uuid';

import { createApp } from '#server/app';
import * as db from '#server/db';
import { APIError, TransactionError } from '#server/errors';
import { app as mainApp } from '#server/main-app';
import { mutator } from '#server/mutators';
import { batchMessages } from '#server/sync';
import { undoable, withUndo } from '#server/undo';
import { dayFromDate } from '#shared/months';
import * as monthUtils from '#shared/months';
import { amountToInteger } from '#shared/util';
import type { ImportTransactionsOpts } from '#types/api-handlers';
import type {
  AccountEntity,
  AccountGroupEntity,
  CategoryEntity,
  ImportTransactionEntity,
} from '#types/models';

import { getStartingBalancePayee } from './payees';
import { PAYEE_NAME_NORMALIZATIONS, reconcileTransactions } from './sync';
import type { ReconcileTransactionsResult } from './sync';

export type AccountHandlers = {
  'account-update': typeof updateAccount;
  'accounts-get': typeof getAccounts;
  'account-balance': typeof getAccountBalance;
  'account-properties': typeof getAccountProperties;
  'account-create': typeof createAccount;
  'account-close': typeof closeAccount;
  'account-reopen': typeof reopenAccount;
  'account-move': typeof moveAccount;
  'transactions-import': typeof importTransactions;
};

async function updateAccount({
  id,
  name,
  last_reconciled,
  account_group_id,
}: Pick<AccountEntity, 'id'> &
  Partial<
    Pick<AccountEntity, 'name' | 'last_reconciled' | 'account_group_id'>
  >) {
  await db.update('accounts', {
    id,
    ...(name !== undefined && { name }),
    ...(last_reconciled && { last_reconciled }),
    ...(account_group_id !== undefined && { account_group_id }),
  });
  return {};
}

async function getAccounts(): Promise<AccountEntity[]> {
  const dbAccounts = await db.getAccounts();
  return dbAccounts.map(
    dbAccount =>
      ({
        id: dbAccount.id,
        name: dbAccount.name,
        offbudget: dbAccount.offbudget,
        closed: dbAccount.closed,
        sort_order: dbAccount.sort_order,
        last_reconciled: dbAccount.last_reconciled ?? null,
        tombstone: dbAccount.tombstone,
        account_group_id: dbAccount.account_group_id ?? null,
      }) satisfies AccountEntity,
  );
}

async function getAccountBalance({
  id,
  cutoff,
}: {
  id: string;
  cutoff: string | Date;
}) {
  const result = await db.first<{ balance: number }>(
    'SELECT sum(amount) as balance FROM transactions WHERE acct = ? AND isParent = 0 AND tombstone = 0 AND date <= ?',
    [id, db.toDateRepr(dayFromDate(cutoff))],
  );
  return result?.balance ? result.balance : 0;
}

async function getAccountProperties({ id }: { id: AccountEntity['id'] }) {
  const balanceResult = await db.first<{ balance: number }>(
    'SELECT sum(amount) as balance FROM transactions WHERE acct = ? AND isParent = 0 AND tombstone = 0',
    [id],
  );
  const countResult = await db.first<{ count: number }>(
    'SELECT count(id) as count FROM transactions WHERE acct = ? AND tombstone = 0',
    [id],
  );

  return {
    balance: balanceResult?.balance || 0,
    numTransactions: countResult?.count || 0,
  };
}

async function createAccount({
  name,
  balance = 0,
  offBudget = false,
  closed = false,
}: {
  name: string;
  balance?: number | undefined;
  offBudget?: boolean | undefined;
  closed?: boolean | undefined;
}) {
  const id: AccountEntity['id'] = await db.insertAccount({
    name,
    offbudget: offBudget ? 1 : 0,
    closed: closed ? 1 : 0,
  });

  await db.insertPayee({
    name: '',
    transfer_acct: id,
  });

  if (balance != null && balance !== 0) {
    const payee = await getStartingBalancePayee();

    await db.insertTransaction({
      account: id,
      amount: amountToInteger(balance),
      category: offBudget ? null : payee.category,
      payee: payee.id,
      date: monthUtils.currentDay(),
      cleared: true,
      starting_balance_flag: true,
    });
  }

  return id;
}

async function closeAccount({
  id,
  transferAccountId,
  categoryId,
  forced = false,
}: {
  id: AccountEntity['id'];
  transferAccountId?: AccountEntity['id'] | undefined;
  categoryId?: CategoryEntity['id'] | undefined;
  forced?: boolean | undefined;
}) {
  return withUndo(async () => {
    const account = await db.first<db.DbAccount>(
      'SELECT * FROM accounts WHERE id = ? AND tombstone = 0',
      [id],
    );

    // Do nothing if the account doesn't exist or it's already been
    // closed
    if (!account || account.closed === 1) {
      return;
    }

    const { balance, numTransactions } = await getAccountProperties({ id });

    // If there are no transactions, we can simply delete the account
    if (numTransactions === 0) {
      await db.deleteAccount({ id });
    } else if (forced) {
      const rows = db.runQuery<
        Pick<db.DbViewTransaction, 'id' | 'transfer_id'>
      >(
        'SELECT id, transfer_id FROM v_transactions WHERE account = ?',
        [id],
        true,
      );

      const transferPayee = await db.first<Pick<db.DbPayee, 'id'>>(
        'SELECT id FROM payees WHERE transfer_acct = ?',
        [id],
      );

      if (!transferPayee) {
        throw new Error(`Transfer payee with account ID ${id} not found.`);
      }

      await batchMessages(async () => {
        // TODO: what this should really do is send a special message that
        // automatically marks the tombstone value for all transactions
        // within an account... or something? This is problematic
        // because another client could easily add new data that
        // should be marked as deleted.

        rows.forEach(row => {
          if (row.transfer_id) {
            void db.updateTransaction({
              id: row.transfer_id,
              payee: null,
              transfer_id: null,
            });
          }

          void db.deleteTransaction({ id: row.id });
        });

        void db.deleteAccount({ id });
        void db.deleteTransferPayee({ id: transferPayee.id });
      });
    } else {
      if (balance !== 0 && transferAccountId == null) {
        throw APIError('balance is non-zero: transferAccountId is required');
      }

      if (id === transferAccountId) {
        throw APIError('transfer account can not be the account being closed');
      }

      await db.update('accounts', { id, closed: 1 });

      // If there is a balance we need to transfer it to the specified
      // account (and possibly categorize it)
      if (balance !== 0 && transferAccountId) {
        const transferPayee = await db.first<Pick<db.DbPayee, 'id'>>(
          'SELECT id FROM payees WHERE transfer_acct = ?',
          [transferAccountId],
        );

        if (!transferPayee) {
          throw new Error(
            `Transfer payee with account ID ${transferAccountId} not found.`,
          );
        }

        await mainApp.handlers['transaction-add']({
          id: uuidv4(),
          payee: transferPayee.id,
          amount: -balance,
          account: id,
          date: monthUtils.currentDay(),
          notes: 'Closing account',
          category: categoryId,
        });
      }
    }
  });
}

async function reopenAccount({ id }: { id: AccountEntity['id'] }) {
  await db.update('accounts', { id, closed: 0 });
}

async function moveAccount({
  id,
  targetId,
  accountGroupId,
}: {
  id: AccountEntity['id'];
  targetId: AccountEntity['id'] | null;
  accountGroupId?: AccountGroupEntity['id'] | null;
}) {
  await db.moveAccount(id, targetId, accountGroupId);
}

export type ImportTransactionsResult = ReconcileTransactionsResult & {
  errors: Array<{
    message: string;
  }>;
};

async function importTransactions({
  accountId,
  transactions,
  isPreview,
  opts,
}: {
  accountId: AccountEntity['id'];
  transactions: ImportTransactionEntity[];
  isPreview: boolean;
  opts?: ImportTransactionsOpts;
}): Promise<ImportTransactionsResult> {
  if (typeof accountId !== 'string') {
    throw APIError('transactions-import: accountId must be an id');
  }

  const payeeNameNormalization = opts?.payeeNameNormalization ?? 'title-case';
  if (!PAYEE_NAME_NORMALIZATIONS.includes(payeeNameNormalization)) {
    throw APIError(
      `transactions-import: payeeNameNormalization must be one of ${PAYEE_NAME_NORMALIZATIONS.join(
        ', ',
      )}, got '${String(payeeNameNormalization)}'`,
    );
  }

  try {
    const reconciled = await reconcileTransactions(accountId, transactions, {
      isPreview,
      defaultCleared: opts?.defaultCleared,
      reimportDeleted: opts?.reimportDeleted,
      payeeNameNormalization,
    });
    return {
      errors: [],
      added: reconciled.added,
      updated: reconciled.updated,
      updatedPreview: reconciled.updatedPreview,
    };
  } catch (err) {
    if (err instanceof TransactionError) {
      return {
        errors: [{ message: err.message }],
        added: [],
        updated: [],
        updatedPreview: [],
      };
    }

    throw err;
  }
}

export const app = createApp<AccountHandlers>();

app.method('account-update', mutator(undoable(updateAccount)));
app.method('accounts-get', getAccounts);
app.method('account-balance', getAccountBalance);
app.method('account-properties', getAccountProperties);
app.method('account-create', mutator(undoable(createAccount)));
app.method('account-close', mutator(closeAccount));
app.method('account-reopen', mutator(undoable(reopenAccount)));
app.method('account-move', mutator(undoable(moveAccount)));
app.method('transactions-import', mutator(undoable(importTransactions)));
