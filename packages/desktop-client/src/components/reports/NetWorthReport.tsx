import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import { q } from '@actual-app/core/shared/query';
import type {
  AccountEntity,
  AccountGroupEntity,
} from '@actual-app/core/types/models';

import { FinancialText } from '#components/FinancialText';
import { buildAccountSide } from '#components/sidebar/useSidebarAccountTree';
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

  // Rows and colors follow the sidebar, so neither trades places when
  // balances do
  const order = sidebarOrder(accounts, accountGroups);
  const colors = new Map<string, string>(
    order.map((id, i) => [id, GROUP_COLORS[i % GROUP_COLORS.length]]),
  );
  const groups = [...data.groups].sort(
    (a, b) => order.indexOf(a.id) - order.indexOf(b.id),
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
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            columnGap: 12,
          }}
        >
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
      </View>

      {data.groups.length === 0 ? (
        <Text style={{ color: theme.pageTextSubdued }}>
          Add accounts and transactions to see your net worth over time.
        </Text>
      ) : (
        <>
          <NetWorthChart data={data} colors={colors} />
          <NetWorthTable data={{ ...data, groups }} colors={colors} />
        </>
      )}
    </View>
  );
}

/**
 * Group ids in the order the sidebar lists them: the on-budget section, then
 * the off-budget one, each with its ungrouped accounts first. Groups holding
 * only closed accounts come last.
 */
function sidebarOrder(
  accounts: readonly AccountEntity[],
  groups: readonly AccountGroupEntity[],
): string[] {
  const open = accounts.filter(account => !account.closed);
  const sorted = [...groups].sort((a, b) => a.sort_order - b.sort_order);
  const order = new Set<string>();
  for (const [isOffBudget, ungroupedId] of [
    [false, UNGROUPED_ON_BUDGET_ID],
    [true, UNGROUPED_OFF_BUDGET_ID],
  ] as const) {
    const { buckets } = buildAccountSide(
      open.filter(account => Boolean(account.offbudget) === isOffBudget),
      sorted,
    );
    for (const { group } of buckets) {
      order.add(group?.id ?? ungroupedId);
    }
  }
  return [
    ...new Set([
      ...order,
      ...sorted.map(group => group.id),
      UNGROUPED_ON_BUDGET_ID,
      UNGROUPED_OFF_BUDGET_ID,
    ]),
  ];
}
