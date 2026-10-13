// @ts-strict-ignore
import * as dateFns from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

import { logger } from '#platform/server/log';
import * as db from '#server/db';
import { TRANSACTION_SORT_INCREMENT } from '#server/db/sort';
import { TransactionError } from '#server/errors';
import { batchMessages } from '#server/sync';
import { batchUpdateTransactions } from '#server/transactions';
import { runRules } from '#server/transactions/transaction-rules';
import * as monthUtils from '#shared/months';
import {
  makeChild as makeChildTransaction,
  recalculateSplit,
} from '#shared/transactions';
import { hasFieldsChanged, integerToAmount } from '#shared/util';
import type { TransactionEntity } from '#types/models';

import { title } from './title';

function makeSplitTransaction(trans, subtransactions) {
  // We need to calculate the final state of split transactions
  const { subtransactions: sub, ...parent } = recalculateSplit({
    ...trans,
    is_parent: true,
    subtransactions: subtransactions.map((transaction, idx) =>
      makeChildTransaction(trans, {
        ...transaction,
        sort_order: 0 - idx,
      }),
    ),
  });
  return [parent, ...sub];
}

function resolvePayee(trans, payeeName, payeesToCreate) {
  if (trans.payee == null && payeeName) {
    // First check our registry of new payees (to avoid a db access)
    // then check the db for existing payees
    let payee = payeesToCreate.get(payeeName.toLowerCase());
    payee = payee || db.getPayeeByName(payeeName);

    if (payee != null) {
      return payee.id;
    } else {
      // Otherwise we're going to create a new one
      const newPayee = { id: uuidv4(), name: payeeName };
      payeesToCreate.set(payeeName.toLowerCase(), newPayee);
      return newPayee.id;
    }
  }

  return trans.payee;
}

export const PAYEE_NAME_NORMALIZATIONS = ['original', 'title-case'] as const;
export type PayeeNameNormalization = (typeof PAYEE_NAME_NORMALIZATIONS)[number];

function normalizePayeeName(
  payeeName: string,
  normalization: PayeeNameNormalization,
): string {
  switch (normalization) {
    case 'original':
      return payeeName;
    case 'title-case':
      return title(payeeName);
    default:
      normalization satisfies never;
      throw new Error(
        `Unknown payee name normalization: ${String(normalization)}`,
      );
  }
}

async function normalizeTransactions(
  transactions,
  acctId,
  {
    payeeNameNormalization = 'title-case',
  }: {
    payeeNameNormalization?: PayeeNameNormalization;
  } = {},
) {
  const payeesToCreate = new Map();

  const normalized = [];
  for (let trans of transactions) {
    // Validate the date because we do some stuff with it. The db
    // layer does better validation, but this will give nicer errors
    if (trans.date == null) {
      throw new Error('`date` is required when adding a transaction');
    }

    // Strip off the irregular properties
    const { payee_name: originalPayeeName, subtransactions, ...rest } = trans;
    trans = rest;

    if (trans.amount != null && !Number.isInteger(trans.amount)) {
      throw new TransactionError(
        `Amount is invalid, must be an integer: ${trans.amount}`,
      );
    }

    if (subtransactions) {
      for (const sub of subtransactions) {
        if (sub.amount != null && !Number.isInteger(sub.amount)) {
          throw new TransactionError(
            `Subtransaction amount is invalid, must be an integer: ${sub.amount}`,
          );
        }
      }
    }

    let payee_name = originalPayeeName;
    if (payee_name) {
      const trimmed = payee_name.trim();
      if (trimmed === '') {
        payee_name = null;
      } else {
        payee_name = normalizePayeeName(trimmed, payeeNameNormalization);
      }
    }

    trans.imported_payee = trans.imported_payee || payee_name;
    if (trans.imported_payee) {
      trans.imported_payee = trans.imported_payee.trim();
    }

    // It's important to resolve both the account and payee early so
    // when rules are run, they have the right data. Resolving payees
    // also simplifies the payee creation process
    trans.account = acctId;
    trans.payee = resolvePayee(trans, payee_name, payeesToCreate);

    trans.category = trans.category ?? null;

    normalized.push({
      payee_name,
      subtransactions: subtransactions
        ? subtransactions.map(t => ({ ...t, account: acctId }))
        : null,
      trans,
    });
  }

  return { normalized, payeesToCreate };
}

function createNewPayees(payeesToCreate, addsAndUpdates) {
  const usedPayeeIds = new Set(addsAndUpdates.map(t => t.payee));

  batchMessages(() => {
    for (const payee of payeesToCreate.values()) {
      // Only create the payee if it ended up being used
      if (usedPayeeIds.has(payee.id)) {
        db.insertPayee(payee);
      }
    }
  });
}

export type MatchTransactionsOptions = {
  strictIdChecking?: boolean;
  reimportDeleted?: boolean;
  payeeNameNormalization?: PayeeNameNormalization;
};

export type ReconcileTransactionsOptions = MatchTransactionsOptions & {
  isPreview?: boolean;
  defaultCleared?: boolean;
};

export type ReconcileTransactionsResult = {
  added: string[];
  updated: string[];
  updatedPreview: Array<{
    transaction: TransactionEntity;
    existing?: TransactionEntity;
    ignored?: boolean;
    tombstone?: boolean;
  }>;
};

export async function reconcileTransactions(
  acctId,
  transactions,
  {
    strictIdChecking = true,
    isPreview = false,
    defaultCleared = true,
    reimportDeleted,
    payeeNameNormalization,
  }: ReconcileTransactionsOptions = {},
): Promise<ReconcileTransactionsResult> {
  logger.log('Performing transaction reconciliation');

  const updated = [];
  const added = [];
  const updatedPreview = [];
  const existingPayeeMap = new Map<string, string>();

  const {
    payeesToCreate,
    transactionsStep1,
    transactionsStep2,
    transactionsStep3,
  } = await matchTransactions(acctId, transactions, {
    strictIdChecking,
    reimportDeleted,
    payeeNameNormalization,
  });

  // Finally, generate & commit the changes
  for (const { trans, subtransactions, match } of transactionsStep3) {
    if (match && !trans.forceAddTransaction) {
      // Skip updating already reconciled (locked) transactions
      if (match.reconciled) {
        updatedPreview.push({ transaction: trans, ignored: true });
        continue;
      }

      // TODO: change the above sql query to use aql
      const existing = {
        ...match,
        cleared: match.cleared === 1,
        date: db.fromDateRepr(match.date),
      };

      // Update the transaction
      const updates = {
        imported_id: trans.imported_id || null,
        payee: existing.payee || trans.payee || null,
        category: existing.category || trans.category || null,
        imported_payee: trans.imported_payee || null,
        notes: existing.notes || trans.notes || null,
        cleared: existing.cleared || trans.cleared || false,
      };

      if (hasFieldsChanged(existing, updates, Object.keys(updates))) {
        updated.push({ id: existing.id, ...updates });
        if (!existingPayeeMap.has(existing.payee)) {
          const payee = db.getPayee(existing.payee);
          existingPayeeMap.set(existing.payee, payee?.name);
        }
        existing.payee_name = existingPayeeMap.get(existing.payee);
        existing.amount = integerToAmount(existing.amount);
        updatedPreview.push({ transaction: trans, existing });
      } else {
        updatedPreview.push({ transaction: trans, ignored: true });
      }

      if (existing.is_parent && existing.cleared !== updates.cleared) {
        const children = db.all<Pick<db.DbViewTransaction, 'id'>>(
          'SELECT id FROM v_transactions WHERE parent_id = ?',
          [existing.id],
        );
        const childUpdates = { cleared: updates.cleared };

        for (const child of children) {
          updated.push({ id: child.id, ...childUpdates });
        }
      }
    } else if (trans.tombstone) {
      if (isPreview) {
        updatedPreview.push({
          transaction: trans,
          existing: false,
          tombstone: true,
        });
      }
    } else {
      // Insert a new transaction
      const { forceAddTransaction: _forceAddTransaction, ...newTrans } = trans;
      const finalTransaction = {
        ...newTrans,
        id: uuidv4(),
        category: trans.category || null,
        cleared: trans.cleared ?? defaultCleared,
      };

      if (subtransactions && subtransactions.length > 0) {
        added.push(...makeSplitTransaction(finalTransaction, subtransactions));
      } else {
        added.push(finalTransaction);
      }
    }
  }

  // Maintain the sort order of the server
  const now = Date.now();
  added.forEach((t, index) => {
    t.sort_order ??= now - index * TRANSACTION_SORT_INCREMENT;
  });

  if (!isPreview) {
    createNewPayees(payeesToCreate, [...added, ...updated]);
    batchUpdateTransactions({ added, updated });
  }

  logger.log('Debug data for the operations:', {
    transactionsStep1,
    transactionsStep2,
    transactionsStep3,
    added,
    updated,
    updatedPreview,
  });

  return {
    added: added.map(trans => trans.id),
    updated: updated.map(trans => trans.id),
    updatedPreview,
  };
}

export async function matchTransactions(
  acctId,
  transactions,
  {
    strictIdChecking = true,
    reimportDeleted = true,
    payeeNameNormalization,
  }: MatchTransactionsOptions = {},
) {
  logger.log('Performing transaction reconciliation matching');

  const hasMatched = new Set();

  const { normalized, payeesToCreate } = await normalizeTransactions(
    transactions,
    acctId,
    { payeeNameNormalization },
  );

  // The first pass runs the rules, and preps data for fuzzy matching
  const accounts: db.DbAccount[] = db.getAccounts();
  const accountsMap = new Map(accounts.map(account => [account.id, account]));

  const transactionsStep1 = [];
  for (const {
    payee_name,
    trans: originalTrans,
    subtransactions,
  } of normalized) {
    // Run the rules
    const trans = runRules(originalTrans, accountsMap);

    let match = null;
    let fuzzyDataset = null;

    // First, match with an existing transaction's imported_id. This
    // is the highest fidelity match and should always be attempted
    // first.
    if (trans.imported_id) {
      // Several transactions can share an imported id, so the order decides
      // which one matches. `v_transactions` orders its rows itself;
      // `v_transactions_internal` (which includes deleted transactions)
      // doesn't, so prefer live rows, then the oldest. The join is there for
      // `rowid`, which the view hides; this stays an index seek on
      // `trans_acct_imported_id`.
      match = db.first<db.DbTransaction>(
        reimportDeleted
          ? 'SELECT * FROM v_transactions WHERE imported_id = ? AND account = ?'
          : `SELECT v.* FROM v_transactions_internal v
              JOIN transactions t ON t.id = v.id
              WHERE v.imported_id = ? AND v.account = ?
              ORDER BY v.tombstone, t.rowid`,
        [trans.imported_id, acctId],
      );

      if (match) {
        hasMatched.add(match.id);
      }
    }

    // If it didn't match, query data needed for fuzzy matching
    if (!match) {
      // Fuzzy matching looks 7 days ahead and 7 days back. This
      // needs to select all fields that need to be read from the
      // matched transaction. See the final pass below for the needed
      // fields.
      const sevenDaysBefore = db.toDateRepr(monthUtils.subDays(trans.date, 7));
      const sevenDaysAfter = db.toDateRepr(monthUtils.addDays(trans.date, 7));
      // strictIdChecking has the added behaviour of only matching on transactions with no import ID
      // if the transaction being imported has an import ID.
      if (strictIdChecking) {
        fuzzyDataset = db.all<
          Pick<
            db.DbViewTransaction,
            | 'id'
            | 'is_parent'
            | 'parent_id'
            | 'date'
            | 'imported_id'
            | 'payee'
            | 'imported_payee'
            | 'category'
            | 'notes'
            | 'reconciled'
            | 'cleared'
            | 'amount'
          >
        >(
          `SELECT id, is_parent, parent_id, date, imported_id, payee, imported_payee, category, notes, reconciled, cleared, amount
          FROM v_transactions
          WHERE
            -- If both ids are set, and we didn't match earlier then skip dedup
            (imported_id IS NULL OR ? IS NULL)
            AND date >= ? AND date <= ? AND amount = ?
            AND account = ?`,
          [
            trans.imported_id || null,
            sevenDaysBefore,
            sevenDaysAfter,
            trans.amount || 0,
            acctId,
          ],
        );
      } else {
        fuzzyDataset = db.all<
          Pick<
            db.DbViewTransaction,
            | 'id'
            | 'is_parent'
            | 'parent_id'
            | 'date'
            | 'imported_id'
            | 'payee'
            | 'imported_payee'
            | 'category'
            | 'notes'
            | 'reconciled'
            | 'cleared'
            | 'amount'
          >
        >(
          `SELECT id, is_parent, parent_id, date, imported_id, payee, imported_payee, category, notes, reconciled, cleared, amount
          FROM v_transactions
          WHERE date >= ? AND date <= ? AND amount = ? AND account = ?`,
          [sevenDaysBefore, sevenDaysAfter, trans.amount || 0, acctId],
        );
      }

      // Sort the matched transactions according to the distance from the original
      // transactions date. i.e. if the original transaction is in 21-02-2024 and
      // the matched transactions are: 20-02-2024, 21-02-2024, 29-02-2024 then
      // the resulting data-set should be: 21-02-2024, 20-02-2024, 29-02-2024.
      fuzzyDataset = fuzzyDataset.sort((a, b) => {
        const aDistance = Math.abs(
          dateFns.differenceInMilliseconds(
            dateFns.parseISO(trans.date),
            dateFns.parseISO(db.fromDateRepr(a.date)),
          ),
        );
        const bDistance = Math.abs(
          dateFns.differenceInMilliseconds(
            dateFns.parseISO(trans.date),
            dateFns.parseISO(db.fromDateRepr(b.date)),
          ),
        );
        return aDistance > bDistance ? 1 : -1;
      });
    }

    transactionsStep1.push({
      payee_name,
      trans,
      subtransactions: trans.subtransactions || subtransactions,
      match,
      fuzzyDataset,
    });
  }

  // Next, do the fuzzy matching. This first pass matches based on the
  // payee id. We do this in multiple passes so that higher fidelity
  // matching always happens first, i.e. a transaction should match
  // match with low fidelity if a later transaction is going to match
  // the same one with high fidelity.
  const transactionsStep2 = transactionsStep1.map(data => {
    if (!data.match && data.fuzzyDataset) {
      // Try to find one where the payees match.
      const match = data.fuzzyDataset.find(
        row => !hasMatched.has(row.id) && data.trans.payee === row.payee,
      );

      if (match) {
        hasMatched.add(match.id);
        return { ...data, match };
      }
    }
    return data;
  });

  // The final fuzzy matching pass. This is the lowest fidelity
  // matching: it just find the first transaction that hasn't been
  // matched yet. Remember the dataset only contains transactions
  // around the same date with the same amount.
  const transactionsStep3 = transactionsStep2.map(data => {
    if (!data.match && data.fuzzyDataset) {
      const match = data.fuzzyDataset.find(row => !hasMatched.has(row.id));
      if (match) {
        hasMatched.add(match.id);
        return { ...data, match };
      }
    }
    return data;
  });

  return {
    payeesToCreate,
    transactionsStep1,
    transactionsStep2,
    transactionsStep3,
  };
}

// This is similar to `reconcileTransactions` except much simpler: it
// does not try to match any transactions. It just adds them
export async function addTransactions(
  acctId,
  transactions,
  { runTransfers = true, learnCategories = false } = {},
) {
  const added = [];

  const { normalized, payeesToCreate } = await normalizeTransactions(
    transactions,
    acctId,
    { payeeNameNormalization: 'original' },
  );

  const accounts: db.DbAccount[] = db.getAccounts();
  const accountsMap = new Map(accounts.map(account => [account.id, account]));

  for (const { trans: originalTrans, subtransactions } of normalized) {
    // Run the rules
    const trans = runRules(originalTrans, accountsMap);

    const finalTransaction = {
      id: uuidv4(),
      ...trans,
      account: acctId,
      cleared: trans.cleared != null ? trans.cleared : true,
    };

    // Add split transactions if they are given
    const updatedSubtransactions =
      finalTransaction.subtransactions || subtransactions;
    if (updatedSubtransactions && updatedSubtransactions.length > 0) {
      added.push(
        ...makeSplitTransaction(finalTransaction, updatedSubtransactions),
      );
    } else {
      added.push(finalTransaction);
    }
  }

  createNewPayees(payeesToCreate, added);

  // Assign decreasing sort_order values to preserve import file order.
  // Transactions are displayed in sort_order DESC order, so first transaction
  // in the file should have the highest sort_order.
  const now = Date.now();
  added.forEach((t, index) => {
    t.sort_order ??= now - index * TRANSACTION_SORT_INCREMENT;
  });

  let newTransactions;
  if (runTransfers || learnCategories) {
    const res = batchUpdateTransactions({
      added,
      learnCategories,
      runTransfers,
    });
    newTransactions = res.added.map(t => t.id);
  } else {
    batchMessages(() => {
      newTransactions = added.map(trans => db.insertTransaction(trans));
    });
  }
  return newTransactions;
}
