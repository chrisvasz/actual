import React from 'react';
import type { ReactElement } from 'react';

import { Block } from '@actual-app/components/block';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import * as monthUtils from '@actual-app/core/shared/months';
import * as d from 'date-fns';

import { useLocale } from '#hooks/useLocale';

type DateRangeProps = {
  start: string;
  end: string;
  type?: string;
  comparisonLabel?: string;
};

function checkDate(date: string) {
  const dateParsed = monthUtils.parseDate(date);
  if (dateParsed) {
    return d.format(dateParsed, 'yyyy-MM-dd');
  } else {
    return null;
  }
}

export function DateRange({
  start,
  end,
  type,
  comparisonLabel,
}: DateRangeProps): ReactElement {
  const locale = useLocale();
  const checkStart = checkDate(start);
  const checkEnd = checkDate(end);

  let startDate;
  let endDate;
  if (checkStart && checkEnd) {
    startDate = d.parseISO(checkStart);
    endDate = d.parseISO(checkEnd);
  } else {
    return (
      <Text style={{ ...styles.mediumText, color: theme.errorText }}>
        There was a problem loading your date range
      </Text>
    );
  }

  const formattedStartDate = d.format(startDate, 'MMM yyyy', { locale });
  const formattedEndDate = d.format(endDate, 'MMM yyyy', { locale });
  let typeOrFormattedEndDate: string;

  if (type && ['budget', 'average'].includes(type)) {
    typeOrFormattedEndDate =
      comparisonLabel ?? (type === 'budget' ? 'budgeted' : 'average');
  } else {
    typeOrFormattedEndDate = formattedEndDate;
  }

  let content: string | ReactElement;
  if (['budget', 'average'].includes(type || '')) {
    content = (
      <div>
        Compare {formattedStartDate} to {typeOrFormattedEndDate}
      </div>
    );
  } else if (
    startDate.getFullYear() !== endDate.getFullYear() ||
    startDate.getMonth() !== endDate.getMonth()
  ) {
    content = (
      <div>
        {type ? (
          <>
            Compare {formattedStartDate} to {typeOrFormattedEndDate}
          </>
        ) : (
          <>
            {formattedStartDate} - {formattedEndDate}
          </>
        )}
      </div>
    );
  } else {
    content = d.format(endDate, 'MMMM yyyy', { locale });
  }

  return <Block style={{ color: theme.pageTextSubdued }}>{content}</Block>;
}
