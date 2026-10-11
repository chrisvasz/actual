import React from 'react';

import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import type {
  balanceTypeOpType,
  DataEntity,
} from '@actual-app/core/types/models';

import { FinancialText } from '#components/FinancialText';
import { useDateFormat } from '#hooks/useDateFormat';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';

import { getIntervalFormat, ReportOptions } from './ReportOptions';

type ReportSummaryProps = {
  startDate: string;
  endDate: string;
  data: DataEntity;
  balanceTypeOp: balanceTypeOpType;
  interval: string;
  intervalsCount: number;
};

export function ReportSummary({
  startDate,
  endDate,
  data,
  balanceTypeOp,
  interval,
  intervalsCount,
}: ReportSummaryProps) {
  const locale = useLocale();
  const format = useFormat();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';
  const intervalFormat = getIntervalFormat(interval, dateFormat);

  const net =
    balanceTypeOp === 'netAssets'
      ? 'DEPOSIT'
      : balanceTypeOp === 'netDebts'
        ? 'PAYMENT'
        : Math.abs(data.totalDebts) > Math.abs(data.totalAssets)
          ? 'PAYMENT'
          : 'DEPOSIT';
  const average = Math.round(data[balanceTypeOp] / intervalsCount);
  return (
    <View
      style={{
        flexDirection: 'column',
        marginBottom: 10,
      }}
    >
      <View
        style={{
          backgroundColor: theme.pageBackground,
          padding: 15,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            ...styles.largeText,
            alignItems: 'center',
            marginBottom: 2,
            fontWeight: 600,
          }}
        >
          {monthUtils.format(startDate, intervalFormat, locale)}
          {monthUtils.format(startDate, intervalFormat, locale) !==
            monthUtils.format(endDate, intervalFormat, locale) &&
            ` ${'to'} ` + monthUtils.format(endDate, intervalFormat, locale)}
        </Text>
      </View>
      <View
        style={{
          backgroundColor: theme.pageBackground,
          padding: 15,
          justifyContent: 'center',
          alignItems: 'center',
          marginTop: 10,
        }}
      >
        <Text
          style={{
            ...styles.mediumText,
            alignItems: 'center',
            marginBottom: 2,
            fontWeight: 400,
          }}
        >
          {balanceTypeOp === 'totalDebts'
            ? 'TOTAL SPENDING'
            : balanceTypeOp === 'totalAssets'
              ? 'TOTAL DEPOSITS'
              : balanceTypeOp === 'totalBudgeted'
                ? 'TOTAL BUDGETED'
                : `NET ${net}`}
        </Text>
        <FinancialText
          style={{
            ...styles.veryLargeText,
            alignItems: 'center',
            marginBottom: 2,
            fontWeight: 800,
          }}
        >
          {format(data[balanceTypeOp], 'financial')}
        </FinancialText>
        <Text style={{ fontWeight: 600 }}>For this time period</Text>
      </View>
      <View
        style={{
          backgroundColor: theme.pageBackground,
          padding: 15,
          justifyContent: 'center',
          alignItems: 'center',
          marginTop: 10,
        }}
      >
        <Text
          style={{
            ...styles.mediumText,
            alignItems: 'center',
            marginBottom: 2,
            fontWeight: 400,
          }}
        >
          {balanceTypeOp === 'totalDebts'
            ? 'AVERAGE SPENDING'
            : balanceTypeOp === 'totalAssets'
              ? 'AVERAGE DEPOSIT'
              : balanceTypeOp === 'totalBudgeted'
                ? 'AVERAGE BUDGETED'
                : 'AVERAGE NET'}
        </Text>
        <FinancialText
          style={{
            ...styles.veryLargeText,
            alignItems: 'center',
            marginBottom: 2,
            fontWeight: 800,
          }}
        >
          {!isNaN(average) && format(average, 'financial')}
        </FinancialText>
        <Text style={{ fontWeight: 600 }}>
          Per {(ReportOptions.intervalMap.get(interval) || '').toLowerCase()}
        </Text>
      </View>
    </View>
  );
}
