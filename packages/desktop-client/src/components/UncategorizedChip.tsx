import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { Link } from '#components/common/Link';
import { useSheetValue } from '#hooks/useSheetValue';
import * as bindings from '#spreadsheet/bindings';

const UNCATEGORIZED_PATH = '/categories/uncategorized';

/**
 * Red text counting the budget's uncategorized transactions, linking to the
 * view that lists them (or, on that view, counting down as they are
 * categorized). Hidden when there are none.
 */
export function UncategorizedChip() {
  const { t } = useTranslation();
  const count: number | null = useSheetValue(bindings.uncategorizedCount());
  const isOnUncategorizedView = useLocation().pathname === UNCATEGORIZED_PATH;
  if (count === null || count <= 0) {
    return null;
  }

  const content = t('{{count}} uncategorized', { count });
  const label = t('{{count}} uncategorized transactions', {
    count,
    defaultValue_one: '{{count}} uncategorized transaction',
    defaultValue_other: '{{count}} uncategorized transactions',
  });

  // On the Uncategorized view itself the count is a live counter, not a link.
  if (isOnUncategorizedView) {
    return (
      <View
        role="status"
        aria-label={label}
        style={{
          padding: '4px 10px',
          whiteSpace: 'nowrap',
          color: theme.errorText,
        }}
      >
        {content}
      </View>
    );
  }

  return (
    <Link
      variant="button"
      buttonVariant="bare"
      to={UNCATEGORIZED_PATH}
      aria-label={label}
      style={{ color: theme.errorText, whiteSpace: 'nowrap' }}
    >
      {content}
    </Link>
  );
}
