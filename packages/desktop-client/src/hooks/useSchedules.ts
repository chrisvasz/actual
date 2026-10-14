import { useMemo } from 'react';

import { q } from '@actual-app/core/shared/query';
import type { ObjectExpression, Query } from '@actual-app/core/shared/query';
import {
  getHasTransactionsQuery,
  getStatus,
} from '@actual-app/core/shared/schedules';
import type { ScheduleStatuses } from '@actual-app/core/shared/schedules';
import type {
  AccountEntity,
  ScheduleEntity,
  TransactionEntity,
} from '@actual-app/core/types/models';

import { accountFilter } from '#queries';
import { getStatusLabel } from '#util/schedule';

import { useLiveQuery } from './useLiveQuery';
import { useSyncedPref } from './useSyncedPref';

export type ScheduleStatusLabelType = ReturnType<typeof getStatusLabel>;
export type ScheduleStatusLabels = Map<
  ScheduleEntity['id'],
  ScheduleStatusLabelType
>;
function getStatuses(
  schedules: readonly ScheduleEntity[],
  scheduleTransactions: readonly TransactionEntity[],
  upcomingLength: string = '7',
) {
  const hasTrans = new Set(
    scheduleTransactions.filter(Boolean).map(row => row.schedule),
  );

  return new Map(
    schedules.map(s => [
      s.id,
      getStatus(
        s.next_date,
        s.completed,
        hasTrans.has(s.id),
        s.custom_upcoming_length ?? upcomingLength,
      ),
    ]),
  ) as ScheduleStatuses;
}

function toScheduleData(
  schedules: readonly ScheduleEntity[],
  statuses: ScheduleStatuses,
): ScheduleData {
  return {
    schedules,
    statuses,
    statusLabels: new Map(
      [...statuses.keys()].map(key => [
        key,
        getStatusLabel(statuses.get(key) || ''),
      ]),
    ),
  };
}

export type UseSchedulesProps = {
  query?: Query;
};
type ScheduleData = {
  schedules: readonly ScheduleEntity[];
  statuses: ScheduleStatuses;
  statusLabels: ScheduleStatusLabels;
};
export type UseSchedulesResult = ScheduleData & {
  readonly isLoading: boolean;
  readonly error?: Error;
};

const NO_SCHEDULES: readonly ScheduleEntity[] = [];
const NO_TRANSACTIONS: readonly TransactionEntity[] = [];
const NOT_A_SCHEDULES_QUERY = new Error('Query must be a schedules query.');

export function useSchedules({
  query,
}: UseSchedulesProps = {}): UseSchedulesResult {
  const [upcomingLength] = useSyncedPref('upcomingScheduledTransactionLength');
  const isSchedulesQuery = query?.state.table === 'schedules';

  const { data: schedules, error: schedulesError } =
    useLiveQuery<ScheduleEntity>(
      () => (query && isSchedulesQuery ? query : null),
      [query, isSchedulesQuery],
    );
  // Unchanged schedules come back as the same array, so this only reruns
  // when a schedule changed
  const { data: scheduleTransactions, error: statusError } =
    useLiveQuery<TransactionEntity>(
      () => (schedules ? getHasTransactionsQuery(schedules) : null),
      [schedules],
    );

  const error =
    query && !isSchedulesQuery
      ? NOT_A_SCHEDULES_QUERY
      : (schedulesError ?? statusError);

  return useMemo(() => {
    // Statuses come from the transactions read; if that read failed, the
    // schedules still show, with the error
    const data = toScheduleData(
      schedules ?? NO_SCHEDULES,
      getStatuses(
        schedules ?? NO_SCHEDULES,
        scheduleTransactions ?? NO_TRANSACTIONS,
        upcomingLength,
      ),
    );
    return {
      // Only without a query (or with a failed read) is nothing loaded
      isLoading: schedules == null && error == null,
      ...(error && { error }),
      ...data,
    };
  }, [schedules, scheduleTransactions, upcomingLength, error]);
}

export function getSchedulesQuery(
  view?: AccountEntity['id'] | 'onbudget' | 'offbudget' | 'uncategorized',
) {
  const filterByAccount = accountFilter(view, '_account');
  const filterByPayee = accountFilter(view, '_payee.transfer_acct');

  let query = q('schedules')
    .select('*')
    .filter({
      $and: [{ '_account.closed': false }],
    });

  if (view) {
    if (view === 'uncategorized') {
      query = query.filter({ next_date: null });
    } else {
      const scheduleFilters: ObjectExpression[] = [
        filterByAccount,
        filterByPayee,
      ].filter(filter => filter !== null);

      if (view !== 'onbudget' && view !== 'offbudget') {
        scheduleFilters.push({
          _has_splits: true,
        });
      }

      query = query.filter({
        $or: scheduleFilters,
      });
    }
  }

  return query.orderBy({ next_date: 'desc' });
}
