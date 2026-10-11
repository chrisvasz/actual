import type { ComponentType, SVGProps } from 'react';

import {
  SvgCloudCheck,
  SvgCloudWarning,
} from '@actual-app/components/icons/v1';
import { SvgCloudUnknown } from '@actual-app/components/icons/v2';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { spacing } from '@actual-app/components/tokens';
import { View } from '@actual-app/components/view';

import { useSyncServerStatus } from '#hooks/useSyncServerStatus';
import { useSyncStatus } from '#hooks/useSyncStatus';
import type { SyncState } from '#hooks/useSyncStatus';

type SyncPresentation = {
  Icon:
    | ComponentType<SVGProps<SVGElement>>
    | ComponentType<SVGProps<SVGSVGElement>>;
  color: string;
  label: string;
};

export function SyncStatusLine() {
  const serverStatus = useSyncServerStatus();
  const { isSyncing, syncState } = useSyncStatus();

  const presentations: Record<
    'no-server' | 'syncing' | 'synced' | Exclude<SyncState, null>,
    SyncPresentation
  > = {
    'no-server': {
      Icon: SvgCloudUnknown,
      color: theme.sidebarTextSubdued,
      label: 'Local only',
    },
    syncing: {
      Icon: SvgCloudCheck,
      color: theme.sidebarTextSubdued,
      label: 'Syncing…',
    },
    error: {
      Icon: SvgCloudWarning,
      color: theme.sidebarTextFailed,
      label: 'Sync error',
    },
    offline: {
      Icon: SvgCloudUnknown,
      color: theme.sidebarTextSubdued,
      label: 'Offline',
    },
    local: {
      Icon: SvgCloudUnknown,
      color: theme.sidebarTextSubdued,
      label: 'Local file',
    },
    disabled: {
      Icon: SvgCloudUnknown,
      color: theme.sidebarTextSubdued,
      label: 'Sync disabled',
    },
    synced: {
      Icon: SvgCloudCheck,
      color: theme.sidebarTextPositive,
      label: 'Synced',
    },
  };

  const statusKey =
    serverStatus === 'no-server'
      ? 'no-server'
      : isSyncing
        ? 'syncing'
        : (syncState ?? 'synced');
  const { Icon, color, label } = presentations[statusKey];

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        marginTop: 1,
      }}
    >
      <Icon width={10} height={10} style={{ flexShrink: 0, color }} />
      <Text
        style={{
          fontSize: 11,
          color: theme.sidebarTextSubdued,
          ...styles.ellipsisText,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
