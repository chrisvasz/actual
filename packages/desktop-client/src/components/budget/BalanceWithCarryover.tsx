// @ts-strict-ignore
import React from 'react';
import type {
  ComponentPropsWithoutRef,
  ComponentType,
  CSSProperties,
} from 'react';

import { SvgArrowThinRight } from '@actual-app/components/icons/v1';
import { View } from '@actual-app/components/view';
import { css } from '@emotion/css';

import { CellValue, CellValueText } from '#components/spreadsheet/CellValue';
import { useSheetValue } from '#hooks/useSheetValue';
import type { Binding } from '#spreadsheet';

import { makeBalanceAmountStyle } from './util';

type CarryoverIndicatorProps = {
  style?: CSSProperties;
};

export function CarryoverIndicator({ style }: CarryoverIndicatorProps) {
  return (
    <View
      style={{
        marginLeft: 2,
        position: 'absolute',
        right: '-4px',
        alignSelf: 'center',
        justifyContent: 'center',
        top: 0,
        bottom: 0,
        ...style,
      }}
    >
      <SvgArrowThinRight
        width={style?.width || 7}
        height={style?.height || 7}
        style={style}
      />
    </View>
  );
}

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
  carryover: Binding<'envelope-budget' | 'tracking-budget', 'carryover'>;
  /**
   * Expense category balance binding is `leftover`,
   * while income category balance binding is `sum-amount`.
   */
  balance: Binding<
    'envelope-budget' | 'tracking-budget',
    'leftover' | 'sum-amount'
  >;
  isDisabled?: boolean;
  CarryoverIndicator?: ComponentType<CarryoverIndicatorProps>;
};

export function BalanceWithCarryover({
  carryover,
  balance,
  isDisabled,
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
              style={makeBalanceAmountStyle(balanceValue)}
            />
          )}
        </>
      )}
    </CellValue>
  );
}
