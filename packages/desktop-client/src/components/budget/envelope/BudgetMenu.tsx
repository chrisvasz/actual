import React from 'react';
import type { ComponentPropsWithoutRef } from 'react';

import { Menu } from '@actual-app/components/menu';

type BudgetMenuProps = Omit<
  ComponentPropsWithoutRef<typeof Menu>,
  'onMenuSelect' | 'items'
> & {
  onCopyLastMonthAverage: () => void;
  onSetMonthsAverage: (numberOfMonths: number) => void;
};
export function BudgetMenu({
  onCopyLastMonthAverage,
  onSetMonthsAverage,
  ...props
}: BudgetMenuProps) {
  const onMenuSelect = (name: string) => {
    switch (name) {
      case 'copy-single-last':
        onCopyLastMonthAverage?.();
        break;
      case 'set-single-3-avg':
        onSetMonthsAverage?.(3);
        break;
      case 'set-single-6-avg':
        onSetMonthsAverage?.(6);
        break;
      case 'set-single-12-avg':
        onSetMonthsAverage?.(12);
        break;
      default:
        throw new Error(`Unrecognized menu item: ${name}`);
    }
  };

  return (
    <Menu
      {...props}
      onMenuSelect={onMenuSelect}
      items={[
        {
          name: 'copy-single-last',
          text: "Copy last month's budget",
        },
        {
          name: 'set-single-3-avg',
          text: 'Set to 3 month average',
        },
        {
          name: 'set-single-6-avg',
          text: 'Set to 6 month average',
        },
        {
          name: 'set-single-12-avg',
          text: 'Set to yearly average',
        },
      ]}
    />
  );
}
