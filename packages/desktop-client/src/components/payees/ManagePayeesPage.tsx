import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import type { PayeeEntity } from '@actual-app/core/types/models';
import { useSuspenseQueries } from '@tanstack/react-query';

import { Page } from '#components/Page';
import { payeeQueries } from '#payees';

import { ManagePayeesWithData } from './ManagePayeesWithData';

export function ManagePayeesPage() {
  const { t } = useTranslation();
  const location = useLocation();

  // Suspend until the table has what it draws, so navigating here keeps the
  // previous screen up instead of drawing an empty table and filling it in.
  useSuspenseQueries({
    queries: [
      payeeQueries.list(),
      payeeQueries.listOrphaned(),
      payeeQueries.ruleCounts(),
    ],
  });
  const locationState = location.state;
  const initialSelectedIds =
    locationState && 'selectedPayee' in locationState
      ? [locationState.selectedPayee as PayeeEntity['id']]
      : [];
  return (
    <Page header={t('Payees')}>
      <ManagePayeesWithData initialSelectedIds={initialSelectedIds} />
    </Page>
  );
}
