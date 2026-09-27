import React, { useEffect, useEffectEvent, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useHref, useLocation } from 'react-router';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as undo from '@actual-app/core/platform/client/undo';

import { getLatestAppVersion, sync } from '#app/appSlice';
import { useMetaThemeColor } from '#hooks/useMetaThemeColor';
import { useNewsNotification } from '#hooks/useNewsNotification';
import { ScrollProvider } from '#hooks/useScrollListener';
import { addNotification } from '#notifications/notificationsSlice';
import { useDispatch } from '#redux';

import { BankSyncStatus } from './BankSyncStatus';
import { CommandBar } from './CommandBar';
import { ContextMenu } from './ContextMenu';
import { FinancesAppRoutes } from './FinancesAppRoutes';
import { GlobalKeys } from './GlobalKeys';
import { Notifications } from './Notifications';
import { MobilePageHeaderProvider, MobilePageHeaderSlot } from './Page';
import { FloatableSidebar } from './sidebar';
import { Titlebar } from './Titlebar';
import { Tour } from './tour/Tour';
import { TourProvider } from './tour/TourProvider';

/**
 * Location-dependent side effects live here, in a component that renders
 * nothing, rather than in `FinancesApp`. Anything calling `useLocation()` (or a
 * hook that calls it) re-renders on every navigation, and `FinancesApp` renders
 * the whole app shell — sidebar, titlebar, notifications, command bar — none of
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

                  <FinancesAppRoutes />
                </View>
              </MobilePageHeaderProvider>
            </ScrollProvider>
          </View>
        </View>
      </View>
    </TourProvider>
  );
}
