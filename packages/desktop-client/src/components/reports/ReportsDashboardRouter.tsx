import { useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { Block } from '@actual-app/components/block';
import { View } from '@actual-app/components/view';
import { useSuspenseQueries } from '@tanstack/react-query';

import { accountQueries } from '#accounts';
import { useNavigate } from '#hooks/useNavigate';
import { dashboardQueries, reportDataQueries, reportQueries } from '#reports';

import { LoadingIndicator } from './LoadingIndicator';
import { Overview } from './Overview';

export function ReportsDashboardRouter() {
  const { t } = useTranslation();
  const { dashboardId } = useParams<{ dashboardId?: string }>();
  const navigate = useNavigate();

  // Suspend until the dashboard has what it lays out, so navigating here
  // keeps the previous screen up instead of showing a loading message first.
  // The cards still load their own data, but most start from the transaction
  // dates loaded here rather than waiting on them.
  const [{ data: dashboardPages }] = useSuspenseQueries({
    queries: [
      dashboardQueries.listDashboardPages(),
      dashboardQueries.listDashboardWidgets(),
      reportQueries.list(),
      accountQueries.list(),
      reportDataQueries.earliestTransactionDate(),
      reportDataQueries.latestTransactionDate(),
    ],
  });

  // With no dashboardId in the URL, show the first dashboard and put its id
  // in the URL. The route stays the same, so it isn't drawn twice.
  const dashboard = dashboardId
    ? dashboardPages.find(d => d.id === dashboardId)
    : dashboardPages[0];

  useEffect(() => {
    if (!dashboardId && dashboard) {
      void navigate(`/reports/${dashboard.id}`, { replace: true });
    }
  }, [dashboardId, dashboard, navigate]);

  if (dashboard) {
    return <Overview dashboard={dashboard} />;
  }

  if (dashboardId) {
    // Invalid dashboardId - show error
    return (
      <View
        style={{
          flex: 1,
          gap: 20,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Block style={{ marginBottom: 20, fontSize: 18 }}>
          <Trans>Dashboard not found</Trans>
        </Block>
      </View>
    );
  }

  // No dashboards exist (NOTE: This should not happen invariant is we always should have at least 1 dashboard)
  return <LoadingIndicator message={t('No dashboards available')} />;
}
