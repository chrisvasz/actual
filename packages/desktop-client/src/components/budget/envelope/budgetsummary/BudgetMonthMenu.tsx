import React from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Menu } from '@actual-app/components/menu';

type BudgetMonthMenuProps = Omit<
  ComponentPropsWithoutRef<typeof Menu>,
  'onMenuSelect' | 'items'
> & {
  onCopyLastMonthBudget: () => void;
  onSetBudgetsToZero: () => void;
  onSetMonthsAverage: (numberOfMonths: number) => void;
};
export function BudgetMonthMenu({
  onCopyLastMonthBudget,
  onSetBudgetsToZero,
  onSetMonthsAverage,
  ...props
}: BudgetMonthMenuProps) {
  const { t } = useTranslation();

  return (
    <Menu
      {...props}
      onMenuSelect={name => {
        switch (name) {
          case 'copy-last':
            onCopyLastMonthBudget();
            break;
          case 'set-zero':
            onSetBudgetsToZero();
            break;
          case 'set-3-avg':
            onSetMonthsAverage(3);
            break;
          case 'set-6-avg':
            onSetMonthsAverage(6);
            break;
          case 'set-12-avg':
            onSetMonthsAverage(12);
            break;
          default:
            throw new Error(`Unrecognized menu option: ${String(name)}`);
        }
      }}
      items={[
        { name: 'copy-last', text: t("Copy last month's budget") },
        { name: 'set-zero', text: t('Set budgets to zero') },
        {
          name: 'set-3-avg',
          text: t('Set budgets to 3 month average'),
        },
        {
          name: 'set-6-avg',
          text: t('Set budgets to 6 month average'),
        },
        {
          name: 'set-12-avg',
          text: t('Set budgets to 12 month average'),
        },
      ]}
    />
  );
}
