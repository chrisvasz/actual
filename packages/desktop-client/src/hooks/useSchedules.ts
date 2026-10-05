import { useEffect, useMemo, useRef, useState } from 'react';

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
import { queryOptions, useQueryClient } from '@tanstack/react-query';

import { accountFilter } from '#queries';
import { aqlQuery } from '#queries/aqlQuery';
import { snapshotDependencies } from '#queries/dependencies';
import type { AqlSnapshot } from '#queries/dependencies';
import { liveQuery } from '#queries/liveQuery';
import type { LiveQuery } from '#queries/liveQuery';
import { getStatusLabel } from '#util/schedule';

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

function loadStatuses(
  schedules: readonly ScheduleEntity[],
  onData: (data: ScheduleStatuses) => void,
  onError: (error: Error) => void,
  upcomingLength: string = '7',
) {
  return liveQuery<TransactionEntity>(getHasTransactionsQuery(schedules), {
    onData: data => {
      onData?.(getStatuses(schedules, data, upcomingLength));
    },
    onError,
  });
}

/**
 * A one-shot load of what `useSchedules` returns for `query`. A screen can
 * suspend on it so it mounts with its schedules in hand; while it's cached,
 * every `useSchedules` with the same query starts from it instead of from an
 * empty, loading state, and its live query then takes over.
 */
export function schedulesSnapshotQuery(
  query: Query,
  upcomingLength: string | undefined,
) {
  return queryOptions<AqlSnapshot<ScheduleData>>({
    queryKey: ['schedules', 'snapshot', query.serialize(), upcomingLength],
    queryFn: async () => {
      const schedulesReply: AqlSnapshot<ScheduleEntity[]> =
        await aqlQuery(query);
      const schedules = schedulesReply.data;
      const transactionsReply: AqlSnapshot<TransactionEntity[]> =
        await aqlQuery(getHasTransactionsQuery(schedules));
      return {
        data: toScheduleData(
          schedules,
          getStatuses(schedules, transactionsReply.data, upcomingLength),
        ),
        dependencies: [
          ...new Set([
            ...schedulesReply.dependencies,
            ...transactionsReply.dependencies,
          ]),
        ],
      };
    },
    staleTime: Infinity,
    // Only kept while a screen holds it; the next visit loads fresh.
    gcTime: 0,
    meta: { dependencies: snapshotDependencies },
  });
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

export function useSchedules({
  query,
}: UseSchedulesProps = {}): UseSchedulesResult {
  const [upcomingLength] = useSyncedPref('upcomingScheduledTransactionLength');
  const queryClient = useQueryClient();
  // Start from a snapshot a screen suspended on, if there is one.
  const [snapshot] = useState(
    () =>
      query &&
      queryClient.getQueryData(
        schedulesSnapshotQuery(query, upcomingLength).queryKey,
      )?.data,
  );
  const [isLoading, setIsLoading] = useState(snapshot == null);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [data, setData] = useState<ScheduleData>(
    snapshot ?? {
      schedules: [],
      statuses: new Map(),
      statusLabels: new Map(),
    },
  );
  // The first live query only refreshes the snapshot, so it doesn't show as
  // loading.
  const isRefreshingSnapshotRef = useRef(snapshot != null);

  const scheduleQueryRef = useRef<LiveQuery<ScheduleEntity> | null>(null);
  const statusQueryRef = useRef<LiveQuery<TransactionEntity> | null>(null);

  useEffect(() => {
    let isUnmounted = false;

    setError(undefined);

    if (!query) {
      // This usually means query is not yet set on this render cycle.
      return;
    }

    function onError(error: Error) {
      if (!isUnmounted) {
        setError(error);
        setIsLoading(false);
      }
    }

    if (query.state.table !== 'schedules') {
      onError(new Error('Query must be a schedules query.'));
      return;
    }

    if (isRefreshingSnapshotRef.current) {
      isRefreshingSnapshotRef.current = false;
    } else {
      setIsLoading(true);
    }

    scheduleQueryRef.current = liveQuery<ScheduleEntity>(query, {
      onData: async schedules => {
        // `onData` fires again whenever the schedules change, so tear down the
        // previous status query first. Otherwise each refresh orphans a live
        // query that stays subscribed to sync events and keeps re-running.
        statusQueryRef.current?.unsubscribe();
        statusQueryRef.current = loadStatuses(
          schedules,
          (statuses: ScheduleStatuses) => {
            if (!isUnmounted) {
              setData(toScheduleData(schedules, statuses));
              setIsLoading(false);
            }
          },
          onError,
          upcomingLength,
        );
      },
      onError,
    });

    return () => {
      isUnmounted = true;
      scheduleQueryRef.current?.unsubscribe();
      statusQueryRef.current?.unsubscribe();
    };
  }, [query, upcomingLength]);

  return useMemo(
    () => ({
      isLoading,
      error,
      ...data,
    }),
    [isLoading, error, data],
  );
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
