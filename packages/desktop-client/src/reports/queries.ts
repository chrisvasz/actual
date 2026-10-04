import { send } from '@actual-app/core/platform/client/connection';
import { q } from '@actual-app/core/shared/query';
import type {
  CustomReportEntity,
  DashboardPageEntity,
  DashboardWidgetEntity,
} from '@actual-app/core/types/models';
import { queryOptions } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import type { useSpreadsheet } from '#hooks/useSpreadsheet';
import { aqlQuery } from '#queries/aqlQuery';

type Spreadsheet = ReturnType<typeof useSpreadsheet>;

/** The async function a report spreadsheet module builds to load its data. */
export type ReportDataLoader<T> = (
  spreadsheet: Spreadsheet,
  setData: (data: T) => void,
) => Promise<void>;

export const reportQueries = {
  all: () => ['reports'],
  lists: () => [...reportQueries.all(), 'lists'],
  list: () =>
    queryOptions<CustomReportEntity[]>({
      queryKey: [...reportQueries.lists()],
      queryFn: async () => {
        return await send('report/get');
      },
    }),
};

export const dashboardQueries = {
  all: () => ['dashboards'],
  lists: () => [...dashboardQueries.all(), 'lists'],
  listDashboardWidgets: <T extends DashboardWidgetEntity>() =>
    queryOptions<T[]>({
      queryKey: [...dashboardQueries.lists(), 'widgets'],
      queryFn: async () => {
        const { data }: { data: T[] } = await aqlQuery(
          q('dashboard').select('*'),
        );
        return data;
      },
    }),
  listDashboardPageWidgets: <T extends DashboardWidgetEntity>(
    dashboardPageId?: DashboardPageEntity['id'] | null,
  ) =>
    queryOptions<T[]>({
      ...dashboardQueries.listDashboardWidgets<T>(),
      select: widgets =>
        widgets.filter(w => w.dashboard_page_id === dashboardPageId),
      enabled: !!dashboardPageId,
    }),
  listDashboardPages: () =>
    queryOptions<DashboardPageEntity[]>({
      queryKey: [...dashboardQueries.lists(), 'pages'],
      queryFn: async () => {
        const { data }: { data: DashboardPageEntity[] } = await aqlQuery(
          q('dashboard_pages').select('*'),
        );
        return data.map(page => ({ ...page, name: page.name ?? '' }));
      },
    }),
};

// Report data is computed from the budget's data, so it is cached until a sync
// event says that data changed (see `sync-events.ts`), not refetched on a
// timer. That lets the dashboard draw each card from the cache when it's
// visited again.
export const reportDataQueries = {
  // Its own root, so invalidating `reportQueries` (saved report settings)
  // doesn't recompute every card.
  all: () => ['report-data'],
  earliestTransactionDate: () =>
    queryOptions<string | null>({
      queryKey: [...reportDataQueries.all(), 'earliest-transaction-date'],
      queryFn: async () => {
        const transaction = await send('get-earliest-transaction');
        return transaction?.date ?? null;
      },
      staleTime: Infinity,
    }),
  latestTransactionDate: () =>
    queryOptions<string | null>({
      queryKey: [...reportDataQueries.all(), 'latest-transaction-date'],
      queryFn: async () => {
        const transaction = await send('get-latest-transaction');
        return transaction?.date ?? null;
      },
      staleTime: Infinity,
    }),
  /**
   * The result of a report spreadsheet. `deps` and `environment` must cover
   * every input `createLoader` reads, since they are the cache key.
   */
  report: <T>({
    name,
    deps,
    environment,
    createLoader,
    spreadsheet,
  }: {
    name: string;
    deps: readonly unknown[];
    environment: Record<string, unknown>;
    createLoader: () => ReportDataLoader<T>;
    spreadsheet: Spreadsheet;
  }) =>
    queryOptions<T>({
      queryKey: [...reportDataQueries.all(), name, deps, environment],
      queryFn: () => runReportLoader(createLoader(), spreadsheet),
      staleTime: Infinity,
      // Long enough that returning to the dashboard draws from the cache, short
      // enough that results for keys no card uses any more are dropped.
      gcTime: 30 * 60 * 1000,
      retry: false,
    }),
};

/**
 * Mark all report data stale after the data behind it changed, refetching what
 * is on screen. Runs already in progress are cancelled first: they may have
 * read data from before the change, and a run that finishes clears the stale
 * mark, so it would otherwise be cached as fresh. Cancelling leaves the
 * worker to finish it, but its result is discarded.
 */
export async function invalidateReportData(queryClient: QueryClient) {
  const queryKey = reportDataQueries.all();
  await queryClient.cancelQueries({ queryKey });
  await queryClient.invalidateQueries({ queryKey });
}

function runReportLoader<T>(
  load: ReportDataLoader<T>,
  spreadsheet: Spreadsheet,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let hasData = false;
    load(spreadsheet, data => {
      hasData = true;
      resolve(data);
    }).then(() => {
      if (!hasData) {
        reject(new Error('The report finished without producing data'));
      }
    }, reject);
  });
}
