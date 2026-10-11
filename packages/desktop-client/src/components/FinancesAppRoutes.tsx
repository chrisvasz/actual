import { ErrorBoundary } from 'react-error-boundary';
import { Navigate, Route, Routes, useLocation } from 'react-router';

import { FeatureErrorFallback } from './FeatureErrorFallback';
import { NotificationsPage } from './news/NotificationsPage';
import { Reports } from './reports';
import { WideComponent } from './responsive';
import { Settings } from './settings';
import { ManageTagsPage } from './tags/ManageTagsPage';

/**
 * The routing table lives in its own component so that `useLocation()` — which
 * re-renders its caller on every navigation — stays out of `FinancesApp`. If
 * `FinancesApp` subscribed to the location, the whole app shell (sidebar,
 * notifications, command bar, …) would re-render on every route
 * change even though none of it depends on the pathname.
 */
export function FinancesAppRoutes() {
  const location = useLocation();

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/budget" replace />} />

      <Route path="/reports/*" element={<Reports />} />

      {/* Rendered by `KeptBudgetPage`, outside the routes, so it survives navigation. */}
      <Route path="/budget" element={null} />

      <Route
        path="/schedules"
        element={
          <ErrorBoundary
            FallbackComponent={FeatureErrorFallback}
            resetKeys={[location.pathname]}
          >
            <WideComponent name="Schedules" />
          </ErrorBoundary>
        }
      />

      <Route
        path="/payees"
        element={
          <ErrorBoundary
            FallbackComponent={FeatureErrorFallback}
            resetKeys={[location.pathname]}
          >
            <WideComponent name="Payees" />
          </ErrorBoundary>
        }
      />
      <Route
        path="/rules"
        element={
          <ErrorBoundary
            FallbackComponent={FeatureErrorFallback}
            resetKeys={[location.pathname]}
          >
            <WideComponent name="Rules" />
          </ErrorBoundary>
        }
      />
      <Route
        path="/rules/:id"
        element={
          <ErrorBoundary
            FallbackComponent={FeatureErrorFallback}
            resetKeys={[location.pathname]}
          >
            <WideComponent name="RuleEdit" />
          </ErrorBoundary>
        }
      />
      <Route path="/tags" element={<ManageTagsPage />} />
      <Route path="/notifications" element={<NotificationsPage />} />
      <Route path="/settings" element={<Settings />} />

      <Route
        path="/accounts"
        element={
          <ErrorBoundary
            FallbackComponent={FeatureErrorFallback}
            resetKeys={[location.pathname]}
          >
            <WideComponent name="Accounts" />
          </ErrorBoundary>
        }
      />

      <Route
        path="/accounts/:id"
        element={
          <ErrorBoundary
            key={location.pathname}
            FallbackComponent={FeatureErrorFallback}
            resetKeys={[location.pathname]}
          >
            <WideComponent name="Account" />
          </ErrorBoundary>
        }
      />

      <Route
        path="/categories/:id"
        element={
          <ErrorBoundary
            FallbackComponent={FeatureErrorFallback}
            resetKeys={[location.pathname]}
          >
            <WideComponent name="Category" />
          </ErrorBoundary>
        }
      />
      {/* redirect all other traffic to the budget page */}
      <Route path="/*" element={<Navigate to="/budget" replace />} />
    </Routes>
  );
}
