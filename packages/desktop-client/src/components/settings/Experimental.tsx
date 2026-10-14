import { useState } from 'react';
import type { ReactNode } from 'react';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { FeatureFlag, ServerPrefs } from '@actual-app/core/types/prefs';

import { Link } from '#components/common/Link';
import { Checkbox } from '#components/forms';
import { useFeatureFlag } from '#hooks/useFeatureFlag';
import { useServerPref } from '#hooks/useServerPref';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { useSyncServerStatus } from '#hooks/useSyncServerStatus';

import { Setting } from './UI';

type FeatureToggleProps = {
  flag: FeatureFlag;
  disableToggle?: boolean;
  error?: ReactNode;
  children: ReactNode;
  feedbackLink?: string;
  note?: ReactNode;
};

function FeatureToggle({
  flag: flagName,
  disableToggle = false,
  feedbackLink,
  error,
  children,
  note,
}: FeatureToggleProps) {
  const enabled = useFeatureFlag(flagName);
  const [_, setFlagPref] = useSyncedPref(`flags.${flagName}`);

  return (
    <label style={{ display: 'flex' }}>
      <Checkbox
        checked={enabled}
        onChange={() => {
          setFlagPref(String(!enabled));
        }}
        disabled={disableToggle}
      />
      <View
        style={{ color: disableToggle ? theme.pageTextSubdued : 'inherit' }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {children}
          {feedbackLink && (
            <Link variant="external" to={feedbackLink}>
              (give feedback)
            </Link>
          )}
        </View>

        {disableToggle && (
          <Text
            style={{
              color: theme.errorText,
              fontWeight: 500,
            }}
          >
            {error}
          </Text>
        )}

        {note && <Text style={{ color: theme.warningText }}>{note}</Text>}
      </View>
    </label>
  );
}

type ServerFeatureToggleProps = {
  prefName: keyof ServerPrefs;
  disableToggle?: boolean;
  error?: ReactNode;
  children: ReactNode;
  feedbackLink?: string;
};

function ServerFeatureToggle({
  prefName,
  disableToggle = false,
  feedbackLink,
  error,
  children,
}: ServerFeatureToggleProps) {
  const [enabled, setEnabled] = useServerPref(prefName);

  const syncServerStatus = useSyncServerStatus();
  const isUsingServer = syncServerStatus !== 'no-server';
  const isServerOffline = syncServerStatus === 'offline';

  if (!isUsingServer || isServerOffline) {
    return null;
  }

  return (
    <label style={{ display: 'flex' }}>
      <Checkbox
        checked={enabled === 'true'}
        onChange={() => {
          setEnabled(enabled === 'true' ? 'false' : 'true');
        }}
        disabled={disableToggle}
      />
      <View
        style={{ color: disableToggle ? theme.pageTextSubdued : 'inherit' }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {children}
          {feedbackLink && (
            <Link variant="external" to={feedbackLink}>
              (give feedback)
            </Link>
          )}
        </View>

        {disableToggle && (
          <Text
            style={{
              color: theme.errorText,
              fontWeight: 500,
            }}
          >
            {error}
          </Text>
        )}
      </View>
    </label>
  );
}

export function ExperimentalFeatures() {
  const [expanded, setExpanded] = useState(false);

  const showServerPrefs =
    localStorage.getItem('devEnableServerPrefs') === 'true';

  return (
    <Setting
      primaryAction={
        expanded ? (
          <View style={{ gap: '1em' }}>
            <FeatureToggle
              flag="actionTemplating"
              feedbackLink="https://github.com/actualbudget/actual/issues/3606"
              note="Deprecated: this feature will be removed in a future release. Use Excel formula mode (Rule formulae) instead."
            >
              Rule action templating
            </FeatureToggle>
            <FeatureToggle
              flag="formulaMode"
              feedbackLink="https://github.com/actualbudget/actual/issues/5949"
            >
              Excel formula mode (Formula cards & Rule formulas)
            </FeatureToggle>
            <FeatureToggle
              flag="currency"
              feedbackLink="https://github.com/actualbudget/actual/issues/5191"
            >
              Currency support
            </FeatureToggle>
            {showServerPrefs && (
              <ServerFeatureToggle
                prefName="flags.plugins"
                disableToggle
                feedbackLink="https://github.com/actualbudget/actual/issues/5950"
              >
                Client-Side plugins (soon)
              </ServerFeatureToggle>
            )}
          </View>
        ) : (
          <Link
            variant="text"
            onClick={() => setExpanded(true)}
            data-testid="experimental-settings"
            style={{
              flexShrink: 0,
              alignSelf: 'flex-start',
              color: theme.pageTextPositive,
            }}
          >
            I understand the risks, show experimental features
          </Link>
        )
      }
    >
      <Text>
        <strong>Experimental features.</strong> These features are not fully
        tested and may not work as expected. THEY MAY CAUSE IRRECOVERABLE DATA
        LOSS. They may do nothing at all. Only enable them if you know what you
        are doing.
      </Text>
    </Setting>
  );
}
