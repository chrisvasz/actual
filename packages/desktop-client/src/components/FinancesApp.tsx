import React, { Suspense, useEffect, useEffectEvent, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useHref, useLocation } from 'react-router';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as undo from '@actual-app/core/platform/client/undo';
import { useQueryClient } from '@tanstack/react-query';

import { getLatestAppVersion, sync } from '#app/appSlice';
import { useMetaThemeColor } from '#hooks/useMetaThemeColor';
import { useNewsNotification } from '#hooks/useNewsNotification';
import { ScrollProvider } from '#hooks/useScrollListener';
import { addNotification } from '#notifications/notificationsSlice';
import { payeeQueries } from '#payees/queries';
import { useDispatch } from '#redux';

import { AppShellEffects } from './AppShellEffects';
import { BankSyncStatus } from './BankSyncStatus';
import { CommandBar } from './CommandBar';
import { ContextMenu } from './ContextMenu';
import { FinancesAppRoutes } from './FinancesAppRoutes';
import {
  FLOATING_SIDEBAR_BUTTON_ATTR,
  FloatingSidebarButton,
} from './FloatingSidebarButton';
import { GlobalKeys } from './GlobalKeys';
import { KeptBudgetPage } from './KeptBudgetPage';
import { Notifications } from './Notifications';
import { MobilePageHeaderProvider, MobilePageHeaderSlot } from './Page';
import { FloatableSidebar } from './sidebar';
import { Tour } from './tour/Tour';
import { TourProvider } from './tour/TourProvider';

/**
 * Location-dependent side effects live here, in a component that renders
 * nothing, rather than in `FinancesApp`. Anything calling `useLocation()` (or a
 * hook that calls it) re-renders on every navigation, and `FinancesApp` renders
 * the whole app shell — sidebar, notifications, command bar — none of
 * which depends on the location.
 */
function RouterBehaviors() {
  const location = useLocation();
  const href = useHref(location);
  useEffect(() => {
    undo.setUndoState('url', href);
  }, [href]);

  // Calls `useLocation()` internally.
  useNewsNotification();

  return null;
}

export function FinancesApp() {
  const { isNarrowWidth } = useResponsive();
  useMetaThemeColor(theme.mobileViewTheme);

  const dispatch = useDispatch();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const init = useEffectEvent(() => {
    // The account, schedules and rules screens suspend on the payee list,
    // which the budget page never loads, so fetch it up front rather than on
    // the first navigation to one of them.
    void queryClient.prefetchQuery(payeeQueries.list());

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
        <AppShellEffects />
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
                    // Pages pad their top by this (see `styles.page`); make
                    // room for the floating sidebar button only while it shows.
                    [`&:has([${FLOATING_SIDEBAR_BUTTON_ATTR}])`]: {
                      '--page-top-inset': '36px',
                    },
                  }}
                >
                  <FloatingSidebarButton />
                  <Notifications />
                  <BankSyncStatus />
                  {isNarrowWidth && <MobilePageHeaderSlot />}

                  <KeptBudgetPage />
                  {/* One boundary above every route, never remounted.
                      Navigations run in a transition, so a screen that
                      suspends on its data keeps the current one up until it's
                      ready; the fallback only shows on a direct load. */}
                  <Suspense fallback={null}>
                    <FinancesAppRoutes />
                  </Suspense>
                </View>
              </MobilePageHeaderProvider>
            </ScrollProvider>
          </View>
        </View>
      </View>
    </TourProvider>
  );
}
