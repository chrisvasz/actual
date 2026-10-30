import { useState } from 'react';

import type { Query } from '@actual-app/core/shared/query';
import type { IntegerAmount } from '@actual-app/core/shared/util';
import type { TransactionEntity } from '@actual-app/core/types/models';

import { useLiveQuery } from './useLiveQuery';

const NO_TRANSACTIONS: ReadonlyArray<TransactionEntity> = [];
const NO_RUNNING_BALANCES: ReadonlyMap<TransactionEntity['id'], IntegerAmount> =
  new Map();

// Mirrors the `splits` AQL option from the server
type TransactionSplitsOption = 'all' | 'inline' | 'grouped' | 'none';

type CalculateRunningBalancesOption =
  | ((
      transactions: readonly TransactionEntity[],
      splits: TransactionSplitsOption,
      startingBalance?: IntegerAmount,
    ) => ReadonlyMap<TransactionEntity['id'], IntegerAmount>)
  | boolean;

type UseTransactionsProps = {
  /**
   * The Query class is immutable so it is important to memoize the query object
   * to prevent unnecessary re-renders i.e. `useMemo`, `useState`, etc.
   */
  query?: Query;
  /**
   * The options to configure the hook behavior.
   */
  options?: {
    /**
     * The number of transactions to load at a time.
     * This is used for pagination and should be set to a reasonable number
     * to avoid loading too many transactions at once.
     * The default is 50.
     * @default 50
     */
    pageSize?: number;
    /**
     * Whether to calculate running balances for the transactions returned by the query.
     * This can be set to `true` to calculate running balances for all transactions
     * (using the default running balance calculation), or a function that takes the
     * transactions and the query state and returns a map of transaction IDs to running balances.
     * The function will be called with the transactions and the query state
     * whenever the transactions are loaded or reloaded.
     *
     * The default running balance calculation is a simple sum of the transaction amounts
     * in reverse order (bottom up). This works well if the transactions are ordered by
     * date in descending order. If the query orders the transactions differently,
     * a custom `calculateRunningBalances` function should be used instead.
     * @default false
     */
    calculateRunningBalances?: CalculateRunningBalancesOption;
    /**
     * The starting balance to start the running balance calculation from.
     * This is ignored if `calculateRunningBalances` is false.
     * @default 0
     */
    startingBalance?: IntegerAmount;
  };
};

type UseTransactionsResult = {
  /**
   * The transactions returned by the query.
   */
  transactions: ReadonlyArray<TransactionEntity>;
  /**
   * The error from the last read of the query, if it failed. The
   * transactions from the read before it are kept.
   */
  error?: Error;
  /**
   * The running balances for the transactions returned by the query.
   * This is only populated if `calculateRunningBalances` is either set to `true`
   * or a function that implements the calculation in the options.
   */
  runningBalances: ReadonlyMap<TransactionEntity['id'], IntegerAmount>;
  /**
   * Whether the query has more rows than the ones loaded so far.
   */
  hasNextPage: boolean;
  /**
   * Load one more page of rows.
   */
  fetchNextPage: () => void;
};

/**
 * The first pages of `query`'s rows, kept current as the tables it reads
 * change. Read synchronously, so the first render has the rows.
 */
export function useTransactions({
  query,
  options,
}: UseTransactionsProps): UseTransactionsResult {
  const {
    pageSize = 50,
    calculateRunningBalances = false,
    startingBalance,
  } = options ?? {};

  // The rows loaded so far, starting over from one page when the query
  // changes. Loading more raises the limit of a single query rather than
  // adding a page, so every loaded row is read in one snapshot.
  const [loaded, setLoaded] = useState<{
    query: Query;
    pageSize: number;
    limit: number;
  } | null>(null);
  const limit =
    loaded != null && loaded.query === query && loaded.pageSize === pageSize
      ? loaded.limit
      : pageSize;

  const { data, error } = useLiveQuery<TransactionEntity>(
    () => query?.limit(limit) ?? null,
    [query, limit],
  );
  const transactions = data ?? NO_TRANSACTIONS;
  const hasNextPage = pageSize > 0 && data != null && data.length >= limit;

  const fetchNextPage = () => {
    if (query && hasNextPage) {
      setLoaded({ query, pageSize, limit: limit + pageSize });
    }
  };

  const calculateRunningBalancesFn = getCalculateRunningBalancesFn(
    calculateRunningBalances,
  );
  const splitsOption = query?.state.tableOptions
    ?.splits as TransactionSplitsOption;
  const runningBalances =
    calculateRunningBalancesFn && data != null
      ? calculateRunningBalancesFn(data, splitsOption, startingBalance)
      : NO_RUNNING_BALANCES;

  return {
    transactions,
    ...(error && { error }),
    runningBalances,
    hasNextPage,
    fetchNextPage,
  };
}

function getCalculateRunningBalancesFn(
  calculateRunningBalances: CalculateRunningBalancesOption = false,
) {
  return calculateRunningBalances === true
    ? calculateRunningBalancesBottomUp
    : typeof calculateRunningBalances === 'function'
      ? calculateRunningBalances
      : undefined;
}

export function calculateRunningBalancesBottomUp(
  transactions: readonly TransactionEntity[],
  splits: TransactionSplitsOption,
  startingBalance: IntegerAmount = 0,
) {
  return (
    transactions
      .filter(t => {
        switch (splits) {
          case 'all':
            // Only calculate parent/non-split amounts
            return !t.parent_id;
          default:
            // inline
            // grouped
            // none
            return true;
        }
      })
      // We're using `reduceRight` here to calculate the running balance in reverse order (bottom up).
      .reduceRight((acc, transaction, index, arr) => {
        const previousTransactionIndex = index + 1;
        if (previousTransactionIndex >= arr.length) {
          // This is the last transaction in the list,
          // so we set the running balance to the starting balance + the amount of the transaction
          acc.set(transaction.id, startingBalance + transaction.amount);
          return acc;
        }
        const previousTransaction = arr[previousTransactionIndex];
        const previousRunningBalance = acc.get(previousTransaction.id) ?? 0;
        const currentRunningBalance =
          previousRunningBalance + transaction.amount;
        acc.set(transaction.id, currentRunningBalance);
        return acc;
      }, new Map<TransactionEntity['id'], IntegerAmount>())
  );
}

export function calculateRunningBalancesTopDown(
  transactions: readonly TransactionEntity[],
  splits: TransactionSplitsOption,
  startingBalance: IntegerAmount = 0,
) {
  return transactions
    .filter(t => {
      switch (splits) {
        case 'all':
          // Only calculate parent/non-split amounts
          return !t.parent_id;
        default:
          // inline
          // grouped
          // none
          return true;
      }
    })
    .reduce((acc, transaction, index, arr) => {
      if (index === 0) {
        // This is the first transaction in the list,
        // so we set the running balance to the starting balance
        acc.set(transaction.id, startingBalance);
        return acc;
      }

      if (index === arr.length - 1) {
        // This is the last transaction in the list,
        // so we set the running balance to the amount of the transaction
        acc.set(transaction.id, transaction.amount);
        return acc;
      }

      const previousTransaction = arr[index - 1];
      const previousRunningBalance = acc.get(previousTransaction.id) ?? 0;
      const previousAmount = previousTransaction.amount ?? 0;
      const currentRunningBalance = previousRunningBalance - previousAmount;
      acc.set(transaction.id, currentRunningBalance);
      return acc;
    }, new Map<TransactionEntity['id'], IntegerAmount>());
}
