import React, { useEffect, useEffectEvent, useRef } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes, useHref, useLocation } from 'react-router';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as undo from '@actual-app/core/platform/client/undo';

import { getLatestAppVersion, sync } from '#app/appSlice';
import { ProtectedRoute } from '#auth/ProtectedRoute';
import { Permissions } from '#auth/types';
import { useMetaThemeColor } from '#hooks/useMetaThemeColor';
import { useNewsNotification } from '#hooks/useNewsNotification';
import { ScrollProvider } from '#hooks/useScrollListener';
import { addNotification } from '#notifications/notificationsSlice';
import { useDispatch } from '#redux';

import { UserAccessPage } from './admin/UserAccess/UserAccessPage';
import { UserDirectoryPage } from './admin/UserDirectory/UserDirectoryPage';
import { BankSyncStatus } from './BankSyncStatus';
import { CommandBar } from './CommandBar';
import { ContextMenu } from './ContextMenu';
import { EnableBankingCallback } from './EnableBankingCallback';
import { FeatureErrorFallback } from './FeatureErrorFallback';
import { GlobalKeys } from './GlobalKeys';
import { NotificationsPage } from './news/NotificationsPage';
import { Notifications } from './Notifications';
import { MobilePageHeaderProvider, MobilePageHeaderSlot } from './Page';
import { Reports } from './reports';
import { WideComponent } from './responsive';
import { useMultiuserEnabled } from './ServerContext';
import { Settings } from './settings';
import { FloatableSidebar } from './sidebar';
import { ManageTagsPage } from './tags/ManageTagsPage';
import { Titlebar } from './Titlebar';
import { Tour } from './tour/Tour';
import { TourProvider } from './tour/TourProvider';

function RouterBehaviors() {
  const location = useLocation();
  const href = useHref(location);
  useEffect(() => {
    undo.setUndoState('url', href);
  }, [href]);

  return null;
}

export function FinancesApp() {
  const { isNarrowWidth } = useResponsive();
  useMetaThemeColor(theme.mobileViewTheme);

  const location = useLocation();
  const dispatch = useDispatch();
  const { t } = useTranslation();

  const multiuserEnabled = useMultiuserEnabled();

  useNewsNotification();

  const init = useEffectEvent(() => {
    // Wait a little bit to make sure the sync button will get the
    // sync start event. This can be improved later.
    setTimeout(async () => {
      await dispatch(sync());
    }, 100);

    async function run() {
      await global.Actual.waitForUpdateReadyForDownload(); // This will only resolve when an update is ready
      dispatch(
        addNotification({
          notification: {
            type: 'message',
            title: t('A new version of Actual is available!'),
            message: t(
              'Click the button below to reload and apply the update.',
            ),
            sticky: true,
            id: 'update-reload-notification',
            button: {
              title: t('Update now'),
              action: async () => {
                await global.Actual.applyAppUpdate();
              },
            },
          },
        }),
      );
    }

    void run();
  });

  useEffect(() => init(), []);

  useEffect(() => {
    void dispatch(getLatestAppVersion());
  }, [dispatch]);

  const scrollableRef = useRef<HTMLDivElement>(null);

  return (
    <TourProvider>
      <View style={{ height: '100%' }}>
        <RouterBehaviors />
        <GlobalKeys />
        <CommandBar />
        <ContextMenu />
        <Tour />
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: theme.pageBackground,
            flex: 1,
          }}
        >
          <FloatableSidebar />

          <View
            style={{
              color: theme.pageText,
              backgroundColor: theme.pageBackground,
              flex: 1,
              overflow: 'hidden',
              width: '100%',
            }}
          >
            <ScrollProvider
              isDisabled={!isNarrowWidth}
              scrollableRef={scrollableRef}
            >
              <MobilePageHeaderProvider>
                <View
                  ref={scrollableRef}
                  style={{
                    flex: 1,
                    overflow: 'auto',
                    position: 'relative',
                  }}
                >
                  <Titlebar
                    style={{
                      WebkitAppRegion: 'drag',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      zIndex: 1000,
                    }}
                  />
                  <Notifications />
                  <BankSyncStatus />
                  {isNarrowWidth && <MobilePageHeaderSlot />}

                  <Routes>
                    <Route
                      path="/"
                      element={<Navigate to="/budget" replace />}
                    />

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
                    {/* The account edit page was narrow-only and is gone, but
                        it used to bounce wide-width visitors here rather than
                        to the catch-all's /budget, so keep that destination. */}
                    <Route
                      path="/bank-sync/account/:accountId/edit"
                      element={<Navigate to="/bank-sync" replace />}
                    />
                    <Route path="/tags" element={<ManageTagsPage />} />
                    <Route
                      path="/notifications"
                      element={<NotificationsPage />}
                    />
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
                    <Route
                      path="/*"
                      element={<Navigate to="/budget" replace />}
                    />
                  </Routes>
                </View>
              </MobilePageHeaderProvider>
            </ScrollProvider>
          </View>
        </View>
      </View>
    </TourProvider>
  );
}
