// @ts-strict-ignore
import React from 'react';
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from 'react';

import { Text } from '@actual-app/components/text';

import { FinancialText } from '#components/FinancialText';
import { useFormat } from '#hooks/useFormat';
import type { FormatType } from '#hooks/useFormat';
import { useSheetName } from '#hooks/useSheetName';
import { useSheetValue } from '#hooks/useSheetValue';
import type {
  Binding,
  SheetFields,
  SheetNames,
  Spreadsheets,
} from '#spreadsheet';

type CellValueProps<
  SheetName extends SheetNames,
  FieldName extends SheetFields<SheetName>,
> = {
  children?: ({
    type,
    name,
    value,
  }: {
    type?: FormatType;
    name: string;
    value: Spreadsheets[SheetName][FieldName];
  }) => ReactNode;
  binding: Binding<SheetName, FieldName>;
  type?: FormatType;
};

export function CellValue<
  SheetName extends SheetNames,
  FieldName extends SheetFields<SheetName>,
>({ type, binding, children, ...props }: CellValueProps<SheetName, FieldName>) {
  const { fullSheetName } = useSheetName(binding);
  const sheetValue = useSheetValue(binding);

  return typeof children === 'function' ? (
    <>{children({ type, name: fullSheetName, value: sheetValue })}</>
  ) : (
    <CellValueText
      type={type}
      name={fullSheetName}
      value={sheetValue}
      {...props}
    />
  );
}

type CellValueTextProps<
  SheetName extends SheetNames,
  FieldName extends SheetFields<SheetName>,
> = Omit<ComponentPropsWithoutRef<typeof Text>, 'value' | 'as'> & {
  type?: FormatType;
  name: string;
  value: Spreadsheets[SheetName][FieldName];
  style?: CSSProperties;
  formatter?: (
    value: Spreadsheets[SheetName][FieldName],
    type?: FormatType,
  ) => string;
};

export function CellValueText<
  SheetName extends SheetNames,
  FieldName extends SheetFields<SheetName>,
>({
  type,
  name,
  value,
  formatter,
  style,
  ...props
}: CellValueTextProps<SheetName, FieldName>) {
  const format = useFormat();
  const isFinancial =
    type === 'financial' ||
    type === 'financial-with-sign' ||
    type === 'financial-no-decimals';
  const sharedProps = {
    style,
    'data-testid': name,
    'data-cellname': name,
    ...props,
  };

  if (isFinancial) {
    return (
      <FinancialText
        {...sharedProps}
        style={{
          whiteSpace: 'nowrap',
          ...style,
        }}
      >
        {formatter ? formatter(value, type) : format(value, type)}
      </FinancialText>
    );
  }

  return (
    <Text {...sharedProps}>
      {formatter ? formatter(value, type) : format(value, type)}
    </Text>
  );
}
