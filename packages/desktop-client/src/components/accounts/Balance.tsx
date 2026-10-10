import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { q } from '@actual-app/core/shared/query';
import type { Query } from '@actual-app/core/shared/query';
import { getScheduledAmount } from '@actual-app/core/shared/schedules';
import { isPreviewId } from '@actual-app/core/shared/transactions';
import type { AccountEntity } from '@actual-app/core/types/models';

import { FinancialText } from '#components/FinancialText';
import { useCachedSchedules } from '#hooks/useCachedSchedules';
import { useFormat } from '#hooks/useFormat';
import { useSelectedItems } from '#hooks/useSelected';
import { useSheetValue } from '#hooks/useSheetValue';

type SelectedBalanceProps = {
  selectedItems: Set<string>;
  account?: AccountEntity;
};

export function SelectedBalance({
  selectedItems,
  account,
}: SelectedBalanceProps) {
  const { t } = useTranslation();

  const name = `selected-balance-${[...selectedItems].join('-')}`;

  const rows = useSheetValue<'balance', `selected-transactions-${string}`>({
    name: name as `selected-transactions-${string}`,
    query: q('transactions')
      .filter({
        id: { $oneof: [...selectedItems] },
        parent_id: { $oneof: [...selectedItems] },
      })
      .select('id'),
  });
  const ids = new Set((rows || []).map((r: { id: string }) => r.id));

  const finalIds = [...selectedItems].filter(id => !ids.has(id));
  let balance = useSheetValue<'balance', `selected-balance-${string}`>({
    name: (name + '-sum') as `selected-balance-${string}`,
    query: q('transactions')
      .filter({ id: { $oneof: finalIds } })
      .options({ splits: 'all' })
      .calculate({ $sum: '$amount' }),
  });

  let scheduleBalance = 0;

  const { isLoading, schedules = [] } = useCachedSchedules();

  if (isLoading) {
    return null;
  }

  let isExactBalance = true;

  for (const id of [...selectedItems].filter(isPreviewId)) {
    // Preview IDs are in the format `preview/<schedule_id>/<date>`
    const scheduleId = id.slice(8).split('/')[0];
    const schedule = schedules.find(s => s.id === scheduleId);
    if (schedule) {
      // If a schedule is `between X and Y` then we calculate the average
      if (schedule._amountOp === 'isbetween') {
        isExactBalance = false;
      }

      if (!account || account.id === schedule._account) {
        scheduleBalance += getScheduledAmount(schedule._amount);
      } else {
        scheduleBalance -= getScheduledAmount(schedule._amount);
      }
    }
  }

  if (typeof balance !== 'number' && !scheduleBalance) {
    return null;
  } else {
    balance = (balance ?? 0) + scheduleBalance;
  }

  return (
    <BalanceStat
      label={t('Selected')}
      value={balance}
      isExact={isExactBalance}
      testId="account-selected-balance"
    />
  );
}

type FilteredBalanceProps = {
  filteredAmount?: number | null;
};

function FilteredBalance({ filteredAmount }: FilteredBalanceProps) {
  const { t } = useTranslation();

  return (
    <BalanceStat
      label={t('Filtered')}
      value={filteredAmount ?? 0}
      testId="account-filtered-balance"
    />
  );
}

function balanceColor(value: number) {
  return value < 0
    ? theme.numberNegative
    : value > 0
      ? theme.numberPositive
      : theme.pageTextSubdued;
}

type BalanceStatProps = {
  label: string;
  value: number;
  isExact?: boolean;
  testId: string;
};

function BalanceStat({
  label,
  value,
  isExact = true,
  testId,
}: BalanceStatProps) {
  const format = useFormat();
  return (
    <BalanceStatLayout label={label} color={balanceColor(value)}>
      <FinancialText
        data-testid={testId}
        style={{ fontSize: 22, fontWeight: 400, color: balanceColor(value) }}
      >
        {!isExact && '~ '}
        {format(value, 'financial')}
      </FinancialText>
    </BalanceStatLayout>
  );
}

type BalanceStatLayoutProps = {
  label: string;
  color: string;
  children: ReactNode;
};

function BalanceStatLayout({ label, color, children }: BalanceStatLayoutProps) {
  return (
    <View>
      <Text
        style={{
          fontSize: 16,
          fontWeight: 500,
          fontVariantCaps: 'all-small-caps',
          letterSpacing: '0.06em',
          lineHeight: 1,
          color,
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

// Number of uncleared transactions in the view; the cleared balance is only
// worth showing when it can differ from the total.
export function unclearedCountCell(balanceQuery: {
  name: `balance-query-${string}`;
  query: Query;
}) {
  return {
    name: `${balanceQuery.name}-uncleared-count`,
    query: balanceQuery.query
      .filter({ cleared: false })
      .calculate({ $count: '$id' }),
  } as const;
}

type BalancesProps = {
  balanceQuery: { name: `balance-query-${string}`; query: Query };
  account?: AccountEntity;
  isFiltered: boolean;
  filteredAmount?: number | null;
};

export function Balances({
  balanceQuery,
  account,
  isFiltered,
  filteredAmount,
}: BalancesProps) {
  const { t } = useTranslation();
  const selectedItems = useSelectedItems();
  const balance = useSheetValue<'balance', `balance-query-${string}`>(
    balanceQuery,
  );
  const clearedBalance = useSheetValue<'balance', `balance-query-${string}`>({
    name: `${balanceQuery.name}-cleared`,
    query: balanceQuery.query.filter({ cleared: true }),
  });
  const unclearedCount = useSheetValue<'balance', `balance-query-${string}`>(
    unclearedCountCell(balanceQuery),
  );

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        columnGap: 32,
        rowGap: 10,
      }}
    >
      <BalanceStat
        label={t('Total')}
        value={balance ?? 0}
        testId="account-balance"
      />
      {(unclearedCount ?? 0) > 0 && (
        <>
          <BalanceStat
            label={t('Cleared')}
            value={clearedBalance ?? 0}
            testId="account-cleared-balance"
          />
          <BalanceStat
            label={t('Uncleared')}
            value={(balance ?? 0) - (clearedBalance ?? 0)}
            testId="account-uncleared-balance"
          />
        </>
      )}

      {selectedItems.size > 0 && (
        <SelectedBalance selectedItems={selectedItems} account={account} />
      )}
      {isFiltered && <FilteredBalance filteredAmount={filteredAmount} />}
    </View>
  );
}
