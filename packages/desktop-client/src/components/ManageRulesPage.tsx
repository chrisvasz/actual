import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';

import { q } from '@actual-app/core/shared/query';
import { useSuspenseQueries } from '@tanstack/react-query';

import { accountQueries } from '#accounts';
import { categoryQueries } from '#budget';
import { FeatureErrorFallback } from '#components/FeatureErrorFallback';
import { schedulesSnapshotQuery } from '#hooks/useSchedules';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { payeeQueries } from '#payees';
import { ruleQueries } from '#rules';

import { ManageRules } from './ManageRules';
import { Page } from './Page';

export function ManageRulesPage() {
  const { t } = useTranslation();
  const [upcomingLength] = useSyncedPref('upcomingScheduledTransactionLength');

  // Suspend until the list has what it draws, so navigating here keeps the
  // previous screen up instead of drawing a spinner and then the rules. The
  // schedules snapshot matches the query `ManageRules` and each rule's
  // schedule value load, so they start from it rather than a spinner.
  useSuspenseQueries({
    queries: [
      ruleQueries.list(),
      schedulesSnapshotQuery(q('schedules').select('*'), upcomingLength),
      categoryQueries.list(),
      payeeQueries.list(),
      accountQueries.list(),
    ],
  });

  return (
    <ErrorBoundary FallbackComponent={FeatureErrorFallback}>
      <Page header={t('Rules')}>
        <ManageRules isModal={false} payeeId={null} />
      </Page>
    </ErrorBoundary>
  );
}
