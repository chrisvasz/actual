import { useEffect, useRef, useState } from 'react';

import type { Query } from '@actual-app/core/shared/query';
import type { IntegerAmount } from '@actual-app/core/shared/util';
import type { TransactionEntity } from '@actual-app/core/types/models';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import {
  hasMoreTransactions,
  loadMoreTransactions,
  transactionQueries,
} from '#transactions';
import type { TransactionsSnapshot } from '#transactions';

const NO_TRANSACTIONS: TransactionEntity[] = [];

// Mirrors the `splits` AQL option from the server
type TransactionSplitsOption = 'all' | 'inline' | 'grouped' | 'none';

type CalculateRunningBalancesOption =
  | ((
      transactions: readonly TransactionEntity[],
      splits: TransactionSplitsOption,
      startingBalance?: IntegerAmount,
    ) => Map<TransactionEntity['id'], IntegerAmount>)
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

type UseTransactionsResult = UseQueryResult<TransactionsSnapshot, Error> & {
  /**
   * The transactions returned by the query.
   */
  transactions: ReadonlyArray<TransactionEntity>;
  /**
   * The running balances for the transactions returned by the query.
   * This is only populated if `calculateRunningBalances` is either set to `true`
   * or a function that implements the calculation in the options.
   */
  runningBalances: Map<TransactionEntity['id'], IntegerAmount>;
  /**
   * Whether the query has more rows than the ones loaded so far.
   */
  hasNextPage: boolean;
  /**
   * Load one more page of rows.
   */
  fetchNextPage: () => Promise<void>;
};

export function useTransactions({
  query,
  options,
}: UseTransactionsProps): UseTransactionsResult {
  const {
    pageSize = 50,
    calculateRunningBalances = false,
    startingBalance,
  } = options ?? {};

  const [runningBalances, setRunningBalances] = useState<
    Map<TransactionEntity['id'], IntegerAmount>
  >(new Map());

  const queryClient = useQueryClient();
  // The rows loaded so far, starting over from one page when the query
  // changes. Loading more raises the limit of a single query rather than
  // adding a page, so a refetch reads every loaded row in one snapshot.
  const [loaded, setLoaded] = useState<{
    query: Query;
    pageSize: number;
    limit: number;
    initialData?: () => TransactionsSnapshot | undefined;
  } | null>(null);
  const args =
    loaded != null && loaded.query === query && loaded.pageSize === pageSize
      ? loaded
      : { query, limit: pageSize };

  const queryResult = useQuery(transactionQueries.aql(args));
  const hasNextPage =
    !queryResult.isPlaceholderData &&
    hasMoreTransactions(queryResult.data, args.limit);

  const isLoadingMoreRef = useRef(false);
  const fetchNextPage = async () => {
    if (!query || !hasNextPage || isLoadingMoreRef.current) {
      return;
    }
    isLoadingMoreRef.current = true;
    try {
      const next = await loadMoreTransactions(queryClient, {
        query,
        limit: args.limit,
        pageSize,
      });
      setLoaded({ ...next, query, pageSize });
    } finally {
      isLoadingMoreRef.current = false;
    }
  };

  const calculateRunningBalancesOptionFn = getCalculateRunningBalancesFn(
    calculateRunningBalances,
  );
  const splitsOption = query?.state.tableOptions
    ?.splits as TransactionSplitsOption;

  // Recalculate running balances whenever the transactions change or the
  // calculation options change (for example, when toggling show/hide
  // running balances). We intentionally keep the main data subscription
  // dependent only on `query` above, but this effect ensures running
  // balances are updated in-place when the caller changes options.
  useEffect(() => {
    if (calculateRunningBalancesOptionFn) {
      if (queryResult.isSuccess) {
        const transactions = queryResult.data.data;
        setRunningBalances(
          calculateRunningBalancesOptionFn(
            transactions,
            splitsOption,
            startingBalance,
          ),
        );
      }
    } else {
      setRunningBalances(new Map());
    }
  }, [
    queryResult.data,
    queryResult.isSuccess,
    calculateRunningBalancesOptionFn,
    startingBalance,
    splitsOption,
  ]);

  const transactions = queryResult.data?.data ?? NO_TRANSACTIONS;

  return {
    ...queryResult,
    transactions,
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
