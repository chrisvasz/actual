import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import { q } from '@actual-app/core/shared/query';
import type {
  CustomReportEntity,
  DashboardPageEntity,
  DashboardWidgetEntity,
} from '@actual-app/core/types/models';
import { queryOptions } from '@tanstack/react-query';

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

// Shared by the cached report results: long enough that returning to the
// dashboard draws from the cache, short enough that results for keys no card
// uses any more are dropped, and recomputed on mount but not on every focus.
const cachedResultOptions = {
  gcTime: 30 * 60 * 1000,
  retry: false,
  refetchOnWindowFocus: false,
} as const;

// Report data is kept so the dashboard can draw each card from its last result
// when it's visited again, but it's never trusted as current: every mount
// recomputes it in the background and swaps in the fresh result. Sync events
// also refresh cards that are on screen (see `sync-events.ts`).
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
      refetchOnWindowFocus: false,
    }),
  latestTransactionDate: () =>
    queryOptions<string | null>({
      queryKey: [...reportDataQueries.all(), 'latest-transaction-date'],
      queryFn: async () => {
        const transaction = await send('get-latest-transaction');
        return transaction?.date ?? null;
      },
      refetchOnWindowFocus: false,
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
      ...cachedResultOptions,
    }),
  /**
   * The result of a formula card. `inputs` are everything `execute` reads, and
   * the cache key; the dates are keyed too, since query time frames slide
   * with them.
   */
  formula: <TInputs extends object>(
    inputs: TInputs,
    execute: (inputs: TInputs) => Promise<number | string>,
  ) =>
    queryOptions<number | string>({
      queryKey: [
        ...reportDataQueries.all(),
        'formula',
        inputs,
        {
          currentMonth: monthUtils.currentMonth(),
          today: monthUtils.currentDay(),
        },
      ],
      queryFn: () => execute(inputs),
      ...cachedResultOptions,
    }),
};

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
