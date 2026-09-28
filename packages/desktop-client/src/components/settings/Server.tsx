import React from 'react';
import { Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { RemoteFile, SyncedLocalFile } from '@actual-app/core/types/file';

import { useAuth } from '#auth/AuthProvider';
import { Permissions } from '#auth/types';
import { closeBudget } from '#budgetfiles/budgetfilesSlice';
import { useMultiuserEnabled, useServerURL } from '#components/ServerContext';
import { useMetadataPref } from '#hooks/useMetadataPref';
import { useNavigate } from '#hooks/useNavigate';
import { useDispatch, useSelector } from '#redux';
import { signOut } from '#users/usersSlice';

import { Setting } from './UI';

export function ServerSettings() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const serverUrl = useServerURL();
  const userData = useSelector(state => state.user.data);
  const [cloudFileId] = useMetadataPref('cloudFileId');
  const { hasPermission } = useAuth();
  const multiuserEnabled = useMultiuserEnabled();
  const allFiles = useSelector(state => state.budgetfiles.allFiles || []);
  const currentFile = (
    allFiles.filter(
      f =>
        f.state === 'remote' || f.state === 'synced' || f.state === 'detached',
    ) as (SyncedLocalFile | RemoteFile)[]
  ).find(f => f.cloudFileId === cloudFileId);

  const isOnline = Boolean(serverUrl && userData && !userData.offline);
  const isAdmin = hasPermission(Permissions.ADMINISTRATOR);
  const canManageUsers = multiuserEnabled && isAdmin && isOnline;
  const canManageAccess =
    multiuserEnabled &&
    isOnline &&
    Boolean(cloudFileId) &&
    (isAdmin ||
      Boolean(
        currentFile && userData && currentFile.owner === userData.userId,
      ));

  async function closeBudgetAndGo(path: string) {
    await dispatch(closeBudget());
    void navigate(path);
  }

  return (
    <Setting
      primaryAction={
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Button onPress={() => void closeBudgetAndGo('/config-server')}>
            {serverUrl ? (
              <Trans>Change server URL</Trans>
            ) : (
              <Trans>Start using a server</Trans>
            )}
          </Button>
          {isOnline && userData?.loginMethod === 'password' && (
            <Button onPress={() => void closeBudgetAndGo('/change-password')}>
              <Trans>Change password</Trans>
            </Button>
          )}
          {canManageUsers && (
            <Button onPress={() => void navigate('/user-directory')}>
              <Trans>User Directory</Trans>
            </Button>
          )}
          {canManageAccess && (
            <Button onPress={() => void navigate('/user-access')}>
              <Trans>User Access Management</Trans>
            </Button>
          )}
          {serverUrl && (
            <Button onPress={() => void dispatch(signOut())}>
              <Trans>Sign out</Trans>
            </Button>
          )}
        </View>
      }
    >
      <Text>
        {!serverUrl ? (
          <Trans>
            <strong>Server:</strong> not connected. A server syncs your budget
            across devices and keeps a backup of your data.
          </Trans>
        ) : userData?.offline ? (
          <Trans>
            <strong>Server:</strong> offline. Changes are saved locally and will
            sync once it's reachable again.
          </Trans>
        ) : (
          <Trans>
            <strong>Server:</strong> online. Your budget is syncing.
          </Trans>
        )}
      </Text>
      {serverUrl && (
        <Text style={{ color: theme.pageTextSubdued }}>
          {multiuserEnabled && userData?.displayName ? (
            <Trans>
              Signed in as {{ userName: userData.displayName }} on{' '}
              {{ serverUrl }}
            </Trans>
          ) : (
            <Trans>Connected to {{ serverUrl }}</Trans>
          )}
        </Text>
      )}
    </Setting>
  );
}
