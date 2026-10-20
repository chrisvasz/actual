import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { FeatureErrorFallback } from '#components/FeatureErrorFallback';

import { ManageRules } from './ManageRules';
import { Page } from './Page';

export function ManageRulesPage() {
  return (
    <ErrorBoundary FallbackComponent={FeatureErrorFallback}>
      <Page header="Rules">
        <ManageRules isModal={false} payeeId={null} />
      </Page>
    </ErrorBoundary>
  );
}
