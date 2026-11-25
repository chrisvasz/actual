import React from 'react';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { UncategorizedChip } from '#components/UncategorizedChip';

import { CATEGORY_COLUMN_CLASS } from './categoryColumnStyles';
import { useMonths } from './MonthsContext';
import { RenderMonths } from './RenderMonths';
import { TableFrame } from './TableFrame';

import { useBudgetComponents } from '.';

export function BudgetSummaries() {
  const { numMonths } = useMonths();
  const { SummaryComponent } = useBudgetComponents();
  const gap = numMonths === 1 ? 0 : 4;

  return (
    <View style={{ flexDirection: 'row', flexShrink: 0 }}>
      <View
        className={CATEGORY_COLUMN_CLASS}
        style={{
          justifyContent: 'flex-end',
          alignItems: 'flex-start',
          paddingBottom: 8,
          backgroundColor: theme.pageBackground,
        }}
      >
        <UncategorizedChip />
      </View>
      <RenderMonths
        style={{ borderLeft: 0, paddingLeft: gap, paddingRight: gap }}
      >
        {({ month }) => <SummaryComponent month={month} />}
      </RenderMonths>
      <TableFrame hasMonthCard={numMonths === 1} />
    </View>
  );
}
