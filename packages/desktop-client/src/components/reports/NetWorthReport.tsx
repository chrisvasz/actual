import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import { q } from '@actual-app/core/shared/query';

import { FinancialText } from '#components/FinancialText';
import { useAccountGroups } from '#hooks/useAccountGroups';
import { useAccounts } from '#hooks/useAccounts';
import { useFormat } from '#hooks/useFormat';
import { useLiveQuery } from '#hooks/useLiveQuery';

import {
  computeNetWorth,
  UNGROUPED_OFF_BUDGET_ID,
  UNGROUPED_ON_BUDGET_ID,
} from './netWorth';
import type { MonthlyAccountSum } from './netWorth';
import { NetWorthChart } from './NetWorthChart';
import { NetWorthTable } from './NetWorthTable';
import { PercentChange } from './PercentChange';

const GROUP_COLORS = [
  theme.chartQual1,
  theme.chartQual2,
  theme.chartQual3,
  theme.chartQual4,
  theme.chartQual5,
  theme.chartQual6,
  theme.chartQual7,
  theme.chartQual8,
  theme.chartQual9,
];

type NetWorthReportProps = {
  /** First and last month shown, `yyyy-MM` */
  start: string;
  end: string;
};

export function NetWorthReport({ start, end }: NetWorthReportProps) {
  const format = useFormat();
  const accounts = useAccounts();
  const accountGroups = useAccountGroups();

  const { data: sums } = useLiveQuery<MonthlyAccountSum>(
    () =>
      q('transactions')
        .filter({ date: { $lte: monthUtils.lastDayOfMonth(end) } })
        .groupBy(['account', { $month: '$date' }])
        .select([
          'account',
          { month: { $month: '$date' } },
          { amount: { $sum: '$amount' } },
        ]),
    [end],
  );

  const data = computeNetWorth({
    months: monthUtils.rangeInclusive(start, end),
    sums: sums ?? [],
    accounts,
    groups: accountGroups,
  });

  // Colors follow the groups' sidebar order, so they don't trade places when
  // balances do
  const colors = new Map<string, string>(
    [
      ...[...accountGroups]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(group => group.id),
      UNGROUPED_ON_BUDGET_ID,
      UNGROUPED_OFF_BUDGET_ID,
    ].map((id, i) => [id, GROUP_COLORS[i % GROUP_COLORS.length]]),
  );

  const baselineLabel = monthUtils.format(data.baselineMonth, 'MMMM yyyy');

  return (
    <View
      data-testid="net-worth-report"
      style={{
        backgroundColor: theme.tableBackground,
        border: `1px solid ${theme.tableBorder}`,
        borderRadius: 6,
        padding: '20px 24px 24px',
        gap: 24,
      }}
    >
      <View style={{ gap: 2 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: theme.tableHeaderText,
          }}
        >
          Net worth
        </Text>
        <FinancialText
          data-testid="net-worth-total"
          style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.3 }}
        >
          {format(data.total.balance, 'financial')}
        </FinancialText>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: 6,
            fontSize: 13,
          }}
        >
          <PercentChange
            change={data.total.change}
            isGood={data.total.changeAmount > 0}
            style={{ fontWeight: 600 }}
          />
          <Text style={{ color: theme.pageTextSubdued }}>
            {data.total.change == null
              ? `No percentage: net worth was at or below zero in ${baselineLabel}`
              : `since ${baselineLabel}`}
          </Text>
        </View>
      </View>

      {data.groups.length === 0 ? (
        <Text style={{ color: theme.pageTextSubdued }}>
          Add accounts and transactions to see your net worth over time.
        </Text>
      ) : (
        <>
          <NetWorthChart
            data={(() => {
              const mk = (
                src: (typeof data.groups)[number],
                id: string,
                deltas: number[],
              ) => {
                const base = 100000_00;
                let b = base;
                const h = deltas.map(d => (b += d * 100));
                return {
                  ...src,
                  id,
                  name: id,
                  history: h,
                  balance: h[h.length - 1],
                  changeAmount: h[h.length - 1] - base,
                  accounts: [],
                };
              };
              const g = [
                mk(data.groups[0], data.groups[0].id, [3000, 3000, -10000]),
                mk(data.groups[0], data.groups[1].id, [9000, -3000, 0]),
                mk(data.groups[0], 'third', [1000, 0, 10000]),
              ];
              const t = mk(data.groups[0], 'net-worth', [13000, 0, 0]);
              return {
                ...data,
                months: data.months.slice(-3),
                groups: g,
                total: t,
              };
            })()}
            colors={new Map([...colors, ['third', '#e9906a']])}
          />
          <NetWorthTable data={data} colors={colors} />
        </>
      )}
    </View>
  );
}
