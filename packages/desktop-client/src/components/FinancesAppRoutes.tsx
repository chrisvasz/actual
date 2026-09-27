import { ErrorBoundary } from 'react-error-boundary';
import { Navigate, Route, Routes, useLocation } from 'react-router';

import { ProtectedRoute } from '#auth/ProtectedRoute';
import { Permissions } from '#auth/types';

import { UserAccessPage } from './admin/UserAccess/UserAccessPage';
import { UserDirectoryPage } from './admin/UserDirectory/UserDirectoryPage';
import { EnableBankingCallback } from './EnableBankingCallback';
import { FeatureErrorFallback } from './FeatureErrorFallback';
import { NotificationsPage } from './news/NotificationsPage';
import { Reports } from './reports';
import { WideComponent } from './responsive';
import { useMultiuserEnabled } from './ServerContext';
import { Settings } from './settings';
import { ManageTagsPage } from './tags/ManageTagsPage';

/**
 * The routing table lives in its own component so that `useLocation()` — which
 * re-renders its caller on every navigation — stays out of `FinancesApp`. If
 * `FinancesApp` subscribed to the location, the whole app shell (sidebar,
 * titlebar, notifications, command bar, …) would re-render on every route
 * change even though none of it depends on the pathname.
 */
export function FinancesAppRoutes() {
  const location = useLocation();
  const multiuserEnabled = useMultiuserEnabled();

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/budget" replace />} />

      <Route path="/reports/*" element={<Reports />} />

      <Route
        path="/budget"
        element={
          <ErrorBoundary
            FallbackComponent={FeatureErrorFallback}
            resetKeys={[location.pathname]}
          >
            <WideComponent name="Budget" />
          </ErrorBoundary>
        }
      />

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
      <Route
        path="/bank-sync"
        element={
          <ErrorBoundary
            FallbackComponent={FeatureErrorFallback}
            resetKeys={[location.pathname]}
          >
            <WideComponent name="BankSync" />
          </ErrorBoundary>
        }
      />
      <Route path="/tags" element={<ManageTagsPage />} />
      <Route path="/notifications" element={<NotificationsPage />} />
      <Route path="/settings" element={<Settings />} />

      <Route
        path="/gocardless/link"
        element={<WideComponent name="GoCardlessLink" />}
      />

      <Route
        path="/enablebanking/auth_callback"
        element={<EnableBankingCallback />}
      />

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
      {multiuserEnabled && (
        <Route
          path="/user-directory"
          element={
            <ProtectedRoute
              permission={Permissions.ADMINISTRATOR}
              element={<UserDirectoryPage />}
            />
          }
        />
      )}
      {multiuserEnabled && (
        <Route
          path="/user-access"
          element={
            <ProtectedRoute
              permission={Permissions.ADMINISTRATOR}
              validateOwner
              element={<UserAccessPage />}
            />
          }
        />
      )}
      {/* redirect all other traffic to the budget page */}
      <Route path="/*" element={<Navigate to="/budget" replace />} />
    </Routes>
  );
}
