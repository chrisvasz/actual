import React from 'react';
import { useLocation } from 'react-router';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { Link } from '#components/common/Link';
import { SheetNameProvider } from '#hooks/useSheetName';
import { useSheetValue } from '#hooks/useSheetValue';
import * as bindings from '#spreadsheet/bindings';

const UNCATEGORIZED_PATH = '/categories/uncategorized';

/**
 * Red text counting the budget's uncategorized transactions, linking to the
 * view that lists them (or, on that view, counting down as they are
 * categorized). Hidden when there are none.
 */
export function UncategorizedChip() {
  // Counted on one sheet whichever screen shows it, so opening an account
  // from the budget (or back) reuses the count instead of counting again
  return (
    <SheetNameProvider name="account">
      <UncategorizedCount />
    </SheetNameProvider>
  );
}

function UncategorizedCount() {
  const count: number | null = useSheetValue(bindings.uncategorizedCount());
  const isOnUncategorizedView = useLocation().pathname === UNCATEGORIZED_PATH;
  if (count === null || count <= 0) {
    return null;
  }

  const content = `${count} uncategorized`;
  const label = `${count} uncategorized ${count === 1 ? 'transaction' : 'transactions'}`;

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
