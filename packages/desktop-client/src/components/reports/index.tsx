import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import { q } from '@actual-app/core/shared/query';

import { Page, PageHeader } from '#components/Page';
import { useLiveQuery } from '#hooks/useLiveQuery';
import { useLocalPref } from '#hooks/useLocalPref';

import { NetWorthReport } from './NetWorthReport';
import { parseReportRange, resolveReportRange } from './reportRange';
import { ReportRangePicker } from './ReportRangePicker';

export function Reports() {
  const [storedRange, setStoredRange] = useLocalPref('reports.range');
  const range = parseReportRange(storedRange);

  const earliestMonth = useEarliestMonth();
  const currentMonth = monthUtils.currentMonth();
  const { start, end } = resolveReportRange(range, currentMonth, earliestMonth);

  return (
    <Page
      header={
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            paddingRight: 20,
          }}
        >
          <PageHeader title="Reports" />
          <ReportRangePicker
            range={range}
            start={start}
            end={end}
            minMonth={earliestMonth ?? currentMonth}
            maxMonth={currentMonth}
            onChange={setStoredRange}
          />
        </View>
      }
    >
      <View
        data-testid="reports-page"
        style={{
          gap: 20,
          paddingTop: 20,
          paddingBottom: 20,
          overflowY: 'auto',
          flex: 1,
        }}
      >
        <NetWorthReport start={start} end={end} />
      </View>
    </Page>
  );
}

/** The month of the budget's first transaction, or null without any. */
function useEarliestMonth(): string | null {
  const { data } = useLiveQuery<{ date: string }>(
    () =>
      q('transactions')
        .filter({ date: { $ne: null } })
        .orderBy({ date: 'asc' })
        .limit(1)
        .select('date'),
    [],
  );
  const date = data?.[0]?.date;
  return date ? monthUtils.monthFromDate(date) : null;
}
