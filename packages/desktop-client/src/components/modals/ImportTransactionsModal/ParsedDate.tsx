import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';

import { formatDate, parseDate } from './utils';

type ParsedDateProps = {
  parseDateFormat?: Parameters<typeof parseDate>[1];
  dateFormat: Parameters<typeof parseDate>[1];
  date?: string;
};

// Shows the parsed date, with the raw value from the file on hover. Dates
// that fail to parse show the raw value in red so the format can be fixed.
export function ParsedDate({
  parseDateFormat,
  dateFormat,
  date,
}: ParsedDateProps) {
  const { t } = useTranslation();
  const parsed =
    date &&
    formatDate(
      parseDateFormat ? parseDate(date, parseDateFormat) : date,
      dateFormat,
    );

  if (!date) {
    return (
      <Text style={{ color: theme.errorText, fontStyle: 'italic' }}>
        <Trans>Empty</Trans>
      </Text>
    );
  }

  return parsed ? (
    <Text title={t('In file: {{date}}', { date })}>{parsed}</Text>
  ) : (
    <Text
      style={{ color: theme.errorText }}
      title={t("Doesn't match the selected date format")}
    >
      {date}
    </Text>
  );
}
