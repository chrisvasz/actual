// @ts-strict-ignore
import React from 'react';
import type { ComponentPropsWithoutRef, ComponentType } from 'react';

import { css } from '@emotion/css';

import { CellValue, CellValueText } from '#components/spreadsheet/CellValue';
import { useSheetValue } from '#hooks/useSheetValue';
import type { Binding } from '#spreadsheet';

import { CarryoverIndicator } from './CarryoverIndicator';
import type { CarryoverIndicatorProps } from './CarryoverIndicator';
import { makeBalanceAmountStyle } from './util';

type CellValueChildren = ComponentPropsWithoutRef<typeof CellValue>['children'];

type ChildrenWithClassName = (
  props: Parameters<CellValueChildren>[0] & {
    className: string;
  },
) => ReturnType<CellValueChildren>;

type BalanceWithCarryoverProps = Omit<
  ComponentPropsWithoutRef<typeof CellValue>,
  'children' | 'binding'
> & {
  children?: ChildrenWithClassName;
  carryover: Binding<'envelope-budget', 'carryover'>;
  /**
   * Expense category balance binding is `leftover`,
   * while income category balance binding is `sum-amount`.
   */
  balance: Binding<'envelope-budget', 'leftover' | 'sum-amount'>;
  isDisabled?: boolean;
  /** What the carryover flag does, shown when hovering its indicator. */
  carryoverLabel?: string;
  CarryoverIndicator?: ComponentType<CarryoverIndicatorProps>;
};

export function BalanceWithCarryover({
  carryover,
  balance,
  isDisabled,
  carryoverLabel = 'Overspending rolls over to next month',
  CarryoverIndicator: CarryoverIndicatorComponent = CarryoverIndicator,
  children,
  ...props
}: BalanceWithCarryoverProps) {
  const carryoverValue = useSheetValue(carryover);

  const getDefaultClassName = (balanceValue: number) =>
    css({
      ...makeBalanceAmountStyle(balanceValue),
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      textAlign: 'right',
      ...(!isDisabled && {
        cursor: 'pointer',
      }),
      ':hover': { textDecoration: 'underline' },
    });

  return (
    <CellValue binding={balance} type="financial" {...props}>
      {({ type, name, value: balanceValue }) => (
        <>
          {children ? (
            children({
              type,
              name,
              value: balanceValue,
              className: getDefaultClassName(balanceValue),
            })
          ) : (
            <CellValueText
              type={type}
              name={name}
              value={balanceValue}
              className={getDefaultClassName(balanceValue)}
            />
          )}

          {carryoverValue && (
            <CarryoverIndicatorComponent
              label={carryoverLabel}
              style={makeBalanceAmountStyle(balanceValue)}
            />
          )}
        </>
      )}
    </CellValue>
  );
}
