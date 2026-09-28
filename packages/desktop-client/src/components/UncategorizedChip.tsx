import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { SvgAlertTriangle } from '@actual-app/components/icons/v2';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { css } from '@emotion/css';

import { Link } from '#components/common/Link';
import { useSheetValue } from '#hooks/useSheetValue';
import * as bindings from '#spreadsheet/bindings';

const UNCATEGORIZED_PATH = '/categories/uncategorized';

/**
 * A warning chip counting the budget's uncategorized transactions, linking to
 * the view that lists them (or, on that view, counting down as they are
 * categorized). Hidden when there are none.
 */
export function UncategorizedChip() {
  const { t } = useTranslation();
  const count: number | null = useSheetValue(bindings.uncategorizedCount());
  const isOnUncategorizedView = useLocation().pathname === UNCATEGORIZED_PATH;
  if (count === null || count <= 0) {
    return null;
  }

  const chipStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    padding: '3px 8px',
    borderRadius: 4,
    whiteSpace: 'nowrap',
    color: theme.warningText,
    backgroundColor: theme.warningBackground,
  } as const;

  const content = (
    <>
      <SvgAlertTriangle width={12} height={12} />
      <Trans count={count}>{{ count }} uncategorized</Trans>
    </>
  );

  // On the Uncategorized view itself the chip is a live counter, not a link.
  if (isOnUncategorizedView) {
    return (
      <View
        role="status"
        aria-label={t('{{count}} uncategorized transactions', { count })}
        style={chipStyle}
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
      aria-label={t('{{count}} uncategorized transactions', { count })}
      className={css({
        ...chipStyle,
        '&[data-hovered], &[data-pressed]': {
          color: theme.warningTextDark,
          backgroundColor: theme.warningBackground,
          filter: 'brightness(0.96)',
        },
      })}
    >
      {content}
    </Link>
  );
}
