import React, { useEffect } from 'react';
import type { ReactNode } from 'react';

import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { tokens } from '@actual-app/components/tokens';
import { View } from '@actual-app/components/view';
import { listen } from '@actual-app/core/platform/client/connection';
import { css } from '@emotion/css';

import { getLatestAppVersion } from '#app/appSlice';
import { closeBudget } from '#budgetfiles/budgetfilesSlice';
import { Link } from '#components/common/Link';
import { Checkbox, FormField, FormLabel } from '#components/forms';
import { Page } from '#components/Page';
import { useServerVersion } from '#components/ServerContext';
import { useFeatureFlag } from '#hooks/useFeatureFlag';
import { useGlobalPref } from '#hooks/useGlobalPref';
import { useMetadataPref } from '#hooks/useMetadataPref';
import { loadPrefs, saveSyncedPrefs } from '#prefs/prefsSlice';
import { useDispatch, useSelector } from '#redux';

import { CurrencySettings } from './Currency';
import { DeployedCommit } from './DeployedCommit';
import { EncryptionSettings } from './Encryption';
import { ExperimentalFeatures } from './Experimental';
import { ExportBudget } from './Export';
import { FormatSettings } from './Format';
import { HelpSettings } from './Help';
import { RepairTransactions } from './RepairTransactions';
import { ResetSync } from './Reset';
import { ServerSettings } from './Server';
import { ThemeSettings } from './Themes';
import { AdvancedToggle, Setting } from './UI';

function About() {
  const version = useServerVersion();
  const versionInfo = useSelector(state => state.app.versionInfo);
  const [notifyWhenUpdateIsAvailable, setNotifyWhenUpdateIsAvailablePref] =
    useGlobalPref('notifyWhenUpdateIsAvailable', () => {
      void dispatch(getLatestAppVersion());
    });
  const dispatch = useDispatch();
  const [showNewsFeed, setShowNewsFeedPref] = useGlobalPref('showNewsFeed');
  const isNewsFeedEnabled = Boolean(showNewsFeed);

  return (
    <Setting>
      <Text>
        <strong>Actual</strong> is a super fast privacy-focused app for managing
        your finances.
      </Text>
      <View
        style={{
          flexDirection: 'column',
          gap: 10,
        }}
        className={css({
          [`@media (min-width: ${tokens.breakpoint_small})`]: {
            display: 'grid',
            gridTemplateRows: '1fr 1fr',
            gridTemplateColumns: '50% 50%',
            columnGap: '2em',
            gridAutoFlow: 'column',
          },
        })}
        data-vrt-mask
      >
        <Text>Client version: {`v${window.Actual?.ACTUAL_VERSION}`}</Text>
        <Text>Server version: {version}</Text>

        {notifyWhenUpdateIsAvailable && versionInfo?.isOutdated ? (
          <Link
            variant="external"
            to="https://actualbudget.org/docs/releases"
            linkColor="purple"
          >
            New version available: {versionInfo.latestVersion}
          </Link>
        ) : (
          <Text style={{ color: theme.noticeText, fontWeight: 600 }}>
            {notifyWhenUpdateIsAvailable ? <>You're up to date!</> : null}
          </Text>
        )}
        <Text>
          <Link
            variant="external"
            to="https://actualbudget.org/docs/releases"
            linkColor="purple"
          >
            Release Notes
          </Link>
          {isNewsFeedEnabled && (
            <>
              {' · '}
              <Link variant="internal" to="/notifications">
                Notifications
              </Link>
            </>
          )}
        </Text>
      </View>
      <View style={{ gap: 5 }}>
        <Text style={{ display: 'flex' }}>
          <Checkbox
            id="settings-notifyWhenUpdateIsAvailable"
            checked={notifyWhenUpdateIsAvailable}
            onChange={e =>
              setNotifyWhenUpdateIsAvailablePref(e.currentTarget.checked)
            }
          />
          <label htmlFor="settings-notifyWhenUpdateIsAvailable">
            Check for new versions of Actual
          </label>
        </Text>
        <Text style={{ display: 'flex' }}>
          <Checkbox
            id="settings-showNewsFeed"
            checked={showNewsFeed}
            onChange={e => setShowNewsFeedPref(e.currentTarget.checked)}
          />
          <label htmlFor="settings-showNewsFeed">
            Show in-app notifications (release notes and announcements)
          </label>
        </Text>
      </View>
    </Setting>
  );
}

function IDName({ children }: { children: ReactNode }) {
  return <Text style={{ fontWeight: 500 }}>{children}</Text>;
}

function AdvancedAbout() {
  const [budgetId] = useMetadataPref('id');
  const [groupId] = useMetadataPref('groupId');

  return (
    <Setting>
      <Text>
        <strong>IDs</strong> are the names Actual uses to identify your budget
        internally. There are several different IDs associated with your budget.
        The Budget ID is used to identify your budget file. The Sync ID is used
        to access the budget on the server.
      </Text>
      <Text>
        <IDName>Budget ID:</IDName> {budgetId}
      </Text>
      <Text style={{ color: theme.pageText }}>
        <IDName>Sync ID:</IDName> {groupId || '(none)'}
      </Text>
      {/* low priority todo: eliminate some or all of these, or decide when/if to show them */}
      {/* <Text>
        <IDName>Cloud File ID:</IDName> {prefs.cloudFileId || t('(none)')}
      </Text>
      <Text>
        <IDName>User ID:</IDName> {prefs.userId || t('(none)')}
      </Text> */}
    </Setting>
  );
}

export function Settings() {
  const [floatingSidebar] = useGlobalPref('floatingSidebar');
  const [budgetName] = useMetadataPref('budgetName');
  const dispatch = useDispatch();
  const isCurrencyExperimentalEnabled = useFeatureFlag('currency');

  const onCloseBudget = () => {
    void dispatch(closeBudget());
  };

  useEffect(() => {
    const unlisten = listen('prefs-updated', () => {
      void dispatch(loadPrefs());
    });

    void dispatch(loadPrefs());
    return () => unlisten();
  }, [dispatch]);

  useEffect(() => {
    if (!isCurrencyExperimentalEnabled) {
      void dispatch(saveSyncedPrefs({ prefs: { defaultCurrencyCode: '' } }));
    }
  }, [dispatch, isCurrencyExperimentalEnabled]);

  const { isNarrowWidth } = useResponsive();

  return (
    <Page
      header="Settings"
      style={{
        marginInline: floatingSidebar && !isNarrowWidth ? 'auto' : 0,
      }}
    >
      <View
        data-testid="settings"
        style={{
          marginTop: 10,
          flexShrink: 0,
          maxWidth: 530,
          width: '100%',
          gap: 30,
        }}
      >
        {isNarrowWidth && (
          <View
            style={{
              gap: 10,
              flexDirection: 'row',
              alignItems: 'flex-end',
              width: '100%',
            }}
          >
            {/* The only spot to close a budget on mobile */}
            <FormField style={{ flex: 1 }}>
              <FormLabel title="Budget name" />
              <Input
                value={budgetName}
                disabled
                style={{ color: theme.buttonNormalDisabledText }}
              />
            </FormField>
            <Button onPress={onCloseBudget} style={{ flexShrink: 0 }}>
              Switch file
            </Button>
          </View>
        )}
        <DeployedCommit />
        <About />
        <ServerSettings />
        <HelpSettings />
        <ThemeSettings />
        <FormatSettings />
        {isCurrencyExperimentalEnabled && <CurrencySettings />}
        <EncryptionSettings />
        <ExportBudget />
        <AdvancedToggle>
          <AdvancedAbout />
          <ResetSync />
          <RepairTransactions />
          <ExperimentalFeatures />
        </AdvancedToggle>
      </View>
    </Page>
  );
}
