import React from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Menu } from '@actual-app/components/menu';
import { theme } from '@actual-app/components/theme';

import type { GoalTarget } from '#components/budget/goalProgress';
import { GoalProgressSummary } from '#components/budget/GoalProgressSummary';
import { trackingBudget } from '#spreadsheet/bindings';

import { useTrackingSheetValue } from './TrackingBudgetComponents';

type BalanceMenuProps = Omit<
  ComponentPropsWithoutRef<typeof Menu>,
  'onMenuSelect' | 'items'
> & {
  categoryId: string;
  goalTarget?: GoalTarget | null;
  onCarryover: (carryover: boolean) => void;
};

export function BalanceMenu({
  categoryId,
  goalTarget,
  onCarryover,
  ...props
}: BalanceMenuProps) {
  const { t } = useTranslation();
  const carryover = useTrackingSheetValue(
    trackingBudget.catCarryover(categoryId),
  );
  return (
    <>
      <GoalProgressSummary
        target={goalTarget ?? null}
        style={{ borderBottom: `1px solid ${theme.menuBorder}` }}
      />
      <Menu
        {...props}
        onMenuSelect={name => {
          switch (name) {
            case 'carryover':
              onCarryover?.(!carryover);
              break;
            default:
              throw new Error(`Unrecognized menu option: ${String(name)}`);
          }
        }}
        items={[
          {
            name: 'carryover',
            text: carryover
              ? t('Remove overspending rollover')
              : t('Rollover overspending'),
          },
        ]}
      />
    </>
  );
}
