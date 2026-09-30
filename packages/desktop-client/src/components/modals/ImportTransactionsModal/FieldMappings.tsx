import React from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { DateFormatSelect } from './DateFormatSelect';
import { SelectField } from './SelectField';
import { stripCsvImportTransaction } from './utils';
import type { DateFormat, FieldMapping, ImportTransaction } from './utils';

type FieldMappingsProps = {
  transactions: ImportTransaction[];
  // Column mappings are only available for CSV files; other file types
  // (QIF) only get the date format picker.
  mappings: FieldMapping | null;
  onChange: (field: keyof FieldMapping, newValue: string) => void;
  parseDateFormat: DateFormat | null;
  onChangeDateFormat: (newValue: string) => void;
  splitMode: boolean;
  inOutMode: boolean;
  hasHeaderRow: boolean;
  reconcile: boolean;
};

// Renders a row directly beneath the table header, with a picker for each
// column that lines up with the column it configures.
export function FieldMappings({
  transactions,
  mappings,
  onChange,
  parseDateFormat,
  onChangeDateFormat,
  splitMode,
  inOutMode,
  hasHeaderRow,
  reconcile,
}: FieldMappingsProps) {
  if (transactions.length === 0) {
    return null;
  }

  const options = Object.keys(stripCsvImportTransaction(transactions[0]));

  function renderSelect(field: keyof FieldMapping) {
    if (mappings == null) {
      return null;
    }
    return (
      <SelectField
        options={options}
        value={mappings[field] ?? null}
        onChange={name => onChange(field, name)}
        hasHeaderRow={hasHeaderRow}
        firstTransaction={transactions[0]}
        style={{ width: '100%' }}
      />
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        flexShrink: 0,
        backgroundColor: theme.tableHeaderBackground,
        borderBottom: '1px solid ' + theme.tableBorder,
      }}
    >
      {reconcile && <MappingCell width={31} />}
      <MappingCell width={200}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {mappings != null && (
            <View style={{ flex: 1 }}>{renderSelect('date')}</View>
          )}
          <View style={{ flex: 1 }}>
            <DateFormatSelect
              transactions={transactions}
              fieldMappings={mappings ?? undefined}
              parseDateFormat={parseDateFormat ?? undefined}
              onChange={onChangeDateFormat}
            />
          </View>
        </View>
      </MappingCell>
      <MappingCell width="flex">{renderSelect('payee')}</MappingCell>
      <MappingCell width="flex">{renderSelect('notes')}</MappingCell>
      <MappingCell width="flex">{renderSelect('category')}</MappingCell>
      {inOutMode && (
        <MappingCell width={90}>{renderSelect('inOut')}</MappingCell>
      )}
      {splitMode ? (
        <>
          <MappingCell width={90}>{renderSelect('outflow')}</MappingCell>
          <MappingCell width={90}>{renderSelect('inflow')}</MappingCell>
        </>
      ) : (
        <MappingCell width={90}>{renderSelect('amount')}</MappingCell>
      )}
    </View>
  );
}

function MappingCell({
  width,
  children,
}: {
  width: CSSProperties['width'] | 'flex';
  children?: ReactNode;
}) {
  return (
    <View
      style={{
        ...(width === 'flex' ? { flex: 1, flexBasis: 0 } : { width }),
        minWidth: 0,
        padding: '4px 5px',
      }}
    >
      {children}
    </View>
  );
}
