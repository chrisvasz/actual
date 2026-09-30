import { useEffect, useState } from 'react';
import type { DependencyList } from 'react';

import * as monthUtils from '@actual-app/core/shared/months';
import { useQueries, useQuery } from '@tanstack/react-query';

import { useDateFormat } from '#hooks/useDateFormat';
import { useLanguage } from '#hooks/useLocale';
import { useSpreadsheet } from '#hooks/useSpreadsheet';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { reportDataQueries } from '#reports';
import type { ReportDataLoader } from '#reports';

export function useReport<T>(
  sheetName: string,
  getData: (
    spreadsheet: ReturnType<typeof useSpreadsheet>,
    setData: (results: T) => void,
  ) => Promise<void>,
): T | null {
  const spreadsheet = useSpreadsheet();
  const [results, setResults] = useState<T | null>(null);

  useEffect(() => {
    let didCancel = false;

    // Reset results whenever a new data function is provided so callers
    // can reliably show a loading state instead of stale/partial data.
    setResults(null);

    void getData(spreadsheet, results => {
      if (!didCancel) {
        setResults(results);
      }
    });

    return () => {
      didCancel = true;
    };
  }, [getData, spreadsheet]);
  return results;
}

/**
 * Load a report through the query cache, so a card visited again draws its
 * last result straight away. `deps` are the cache key alongside `name`, so like
 * `useMemo` they must list everything `createLoader` reads; lint checks this.
 * Values that `useFormat` and `useLocale` depend on are keyed automatically.
 */
export function useReportQuery<T>(
  createLoader: () => ReportDataLoader<T>,
  deps: DependencyList,
  { name, enabled = true }: { name: string; enabled?: boolean },
): T | null {
  const spreadsheet = useSpreadsheet();
  const environment = useReportEnvironment();
  const { data } = useQuery({
    ...reportDataQueries.report<T>({
      name,
      deps,
      environment,
      createLoader,
      spreadsheet,
    }),
    enabled,
  });
  return data ?? null;
}

/**
 * The dates of the first and last transactions, each today when there are no
 * transactions. `null` until they have loaded.
 */
export function useTransactionDates(): {
  earliest: string;
  latest: string;
} | null {
  const [{ data: earliest }, { data: latest }] = useQueries({
    queries: [
      reportDataQueries.earliestTransactionDate(),
      reportDataQueries.latestTransactionDate(),
    ],
  });
  if (earliest === undefined || latest === undefined) {
    return null;
  }
  const today = monthUtils.currentDay();
  return { earliest: earliest ?? today, latest: latest ?? today };
}

// Preferences that change what a report produces without being passed to it:
// the number and date formatting behind `useFormat`, `useDateFormat` and the
// locale, which spreadsheets bake into labels.
function useReportEnvironment() {
  const language = useLanguage();
  const dateFormat = useDateFormat();
  const [numberFormat] = useSyncedPref('numberFormat');
  const [hideFraction] = useSyncedPref('hideFraction');
  const [currencyCode] = useSyncedPref('defaultCurrencyCode');
  const [symbolPosition] = useSyncedPref('currencySymbolPosition');
  const [symbolSpace] = useSyncedPref('currencySpaceBetweenAmountAndSymbol');
  return {
    language,
    dateFormat,
    numberFormat,
    hideFraction,
    currencyCode,
    symbolPosition,
    symbolSpace,
  };
}
