import { useEffect, useMemo, useState } from 'react';

import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import { computeSchedulePreviewTransactions } from '@actual-app/core/shared/schedules';
import { ungroupTransactions } from '@actual-app/core/shared/transactions';
import type { IntegerAmount } from '@actual-app/core/shared/util';
import type {
  ScheduleEntity,
  TransactionEntity,
} from '@actual-app/core/types/models';

import { useCachedSchedules } from './useCachedSchedules';
import { useSyncedPref } from './useSyncedPref';

type UsePreviewTransactionsProps = {
  filter?: (schedule: ScheduleEntity) => boolean;
  options?: {
    /**
     * Whether to calculate running balances.
     */
    calculateRunningBalances?: boolean;
    /**
     * The starting balance to start the running balance calculation from.
     * This is ignored if `calculateRunningBalances` is false.
     */
    startingBalance?: IntegerAmount;
  };
};

type UsePreviewTransactionsResult = {
  previewTransactions: ReadonlyArray<TransactionEntity>;
  runningBalances: Map<TransactionEntity['id'], IntegerAmount>;
  isLoading: boolean;
  error?: Error;
};

export function comparePreviewTransactions(
  a: Pick<TransactionEntity, 'date' | 'amount'> & {
    sort_order?: number | null;
  },
  b: Pick<TransactionEntity, 'date' | 'amount'> & {
    sort_order?: number | null;
  },
): number {
  const dateDiff =
    monthUtils.parseDate(b.date).getTime() -
    monthUtils.parseDate(a.date).getTime();
  if (dateDiff !== 0) return dateDiff;

  const sortOrderDiff = (b.sort_order ?? 0) - (a.sort_order ?? 0);
  if (sortOrderDiff !== 0) return sortOrderDiff;

  return a.amount - b.amount;
}

export function usePreviewTransactions({
  filter,
  options,
}: UsePreviewTransactionsProps = {}): UsePreviewTransactionsResult {
  const [previewTransactions, setPreviewTransactions] = useState<
    TransactionEntity[]
  >([]);
  const {
    isLoading: isSchedulesLoading,
    error: scheduleQueryError,
    schedules,
    statuses,
  } = useCachedSchedules();
  const [isLoading, setIsLoading] = useState(isSchedulesLoading);
  const [error, setError] = useState<Error | undefined>(undefined);

  const [upcomingLength] = useSyncedPref('upcomingScheduledTransactionLength');

  const scheduleTransactions = useMemo(() => {
    if (isSchedulesLoading) {
      return [];
    }

    return computeSchedulePreviewTransactions(
      schedules,
      statuses,
      upcomingLength,
      filter,
    );
  }, [filter, isSchedulesLoading, schedules, statuses, upcomingLength]);

  useEffect(() => {
    let isUnmounted = false;

    setError(undefined);

    if (scheduleTransactions.length === 0) {
      setIsLoading(false);
      setPreviewTransactions([]);
      return;
    }

    setIsLoading(true);

    Promise.all(
      scheduleTransactions.map(transaction =>
        // Kick off an async rules application
        send('rules-run', { transaction }),
      ),
    )
      .then(newTrans => {
        if (!isUnmounted) {
          const scheduleById = new Map(schedules.map(s => [s.id, s]));
          const withDefaults = newTrans.map(t => ({
            ...t,
            category: t.schedule != null ? statuses.get(t.schedule) : undefined,
            schedule: t.schedule,
            sort_order:
              t.schedule != null
                ? scheduleById.get(t.schedule)?.sort_order
                : undefined,
            subtransactions: t.subtransactions?.map(
              (st: TransactionEntity) => ({
                ...st,
                id: 'preview/' + st.id,
                schedule: t.schedule,
              }),
            ),
          }));

          // re-sort in case rule actions have changed the dates
          withDefaults.sort(comparePreviewTransactions);

          const ungroupedTransactions = ungroupTransactions(withDefaults);
          setPreviewTransactions(ungroupedTransactions);

          setIsLoading(false);
        }
      })
      .catch(error => {
        if (!isUnmounted) {
          setError(error);
          setIsLoading(false);
        }
      });

    return () => {
      isUnmounted = true;
    };
  }, [scheduleTransactions, schedules, statuses, upcomingLength]);

  const runningBalances = useMemo(() => {
    if (!options?.calculateRunningBalances) {
      return new Map<TransactionEntity['id'], IntegerAmount>();
    }

    // We always use the bottom up calculation for preview transactions
    // because the hook controls the order of the transactions.
    return calculateRunningBalancesBottomUp(
      previewTransactions,
      'all',
      options?.startingBalance,
    );
  }, [
    previewTransactions,
    options?.calculateRunningBalances,
    options?.startingBalance,
  ]);

  const returnError = error || scheduleQueryError;
  return {
    previewTransactions,
    runningBalances,
    isLoading: isLoading || isSchedulesLoading,
    ...(returnError && { error: returnError }),
  };
}

// Mirrors the `splits` AQL option from the server
type TransactionSplitsOption = 'all' | 'inline' | 'grouped' | 'none';

/**
 * Each transaction's running balance, from the bottom up: `startingBalance`
 * plus its amount and every amount below it. With `splits: 'all'`, split
 * children are skipped (their parent's amount includes theirs).
 */
export function calculateRunningBalancesBottomUp(
  transactions: readonly TransactionEntity[],
  splits: TransactionSplitsOption,
  startingBalance: IntegerAmount = 0,
) {
  const balances = new Map<TransactionEntity['id'], IntegerAmount>();
  let balance = startingBalance;
  for (let i = transactions.length - 1; i >= 0; i--) {
    const transaction = transactions[i];
    if (splits === 'all' && transaction.parent_id) {
      continue;
    }
    balance += transaction.amount;
    balances.set(transaction.id, balance);
  }
  return balances;
}
