import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { useSuspenseQueries } from '@tanstack/react-query';

import { categoryQueries } from '#budget';
import { FeatureErrorFallback } from '#components/FeatureErrorFallback';
import { ruleQueries } from '#rules';

import { ManageRules } from './ManageRules';
import { Page } from './Page';

export function ManageRulesPage() {
  // Suspend until the list has what it draws, so navigating here keeps the
  // previous screen up instead of drawing a spinner and then the rules.
  // Schedules, payees and accounts are read synchronously, so they need no
  // wait.
  useSuspenseQueries({
    queries: [ruleQueries.list(), categoryQueries.list()],
  });

  return (
    <ErrorBoundary FallbackComponent={FeatureErrorFallback}>
      <Page header="Rules">
        <ManageRules isModal={false} payeeId={null} />
      </Page>
    </ErrorBoundary>
  );
}
