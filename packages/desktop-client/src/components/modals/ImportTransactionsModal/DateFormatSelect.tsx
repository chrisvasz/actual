import React from 'react';
import { useTranslation } from 'react-i18next';

import { Select } from '@actual-app/components/select';

import { dateFormats } from './utils';
import type { DateFormat, FieldMapping, ImportTransaction } from './utils';

type DateFormatSelectProps = {
  transactions: ImportTransaction[];
  fieldMappings?: FieldMapping;
  parseDateFormat?: DateFormat;
  onChange: (newValue: string) => void;
};

export function DateFormatSelect({
  transactions,
  fieldMappings,
  parseDateFormat,
  onChange,
}: DateFormatSelectProps) {
  const { t } = useTranslation();
  // We don't actually care about the delimiter, but we try to render
  // it based on the data we have so far. Look in a transaction and
  // try to figure out what delimiter the date is using, and default
  // to space if we can't figure it out.
  let delimiter = '-';
  const dateField = fieldMappings ? fieldMappings.date : 'date';
  if (transactions.length > 0 && dateField != null) {
    const date = transactions[0][dateField];
    const m = date && String(date).match(/[/.,\-/\\]/);
    delimiter = m ? m[0] : ' ';
  }

  return (
    <Select
      aria-label={t('Date format')}
      options={dateFormats.map(f => [
        f.format,
        f.label.replace(/ /g, delimiter),
      ])}
      value={parseDateFormat || ''}
      onChange={onChange}
      style={{ width: '100%' }}
    />
  );
}
