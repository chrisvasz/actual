import React from 'react';

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
            {serverUrl ? 'Change server URL' : 'Start using a server'}
          </Button>
          {isOnline && userData?.loginMethod === 'password' && (
            <Button onPress={() => void closeBudgetAndGo('/change-password')}>
              Change password
            </Button>
          )}
          {canManageUsers && (
            <Button onPress={() => void navigate('/user-directory')}>
              User Directory
            </Button>
          )}
          {canManageAccess && (
            <Button onPress={() => void navigate('/user-access')}>
              User Access Management
            </Button>
          )}
          {serverUrl && (
            <Button onPress={() => void dispatch(signOut())}>Sign out</Button>
          )}
        </View>
      }
    >
      <Text>
        {!serverUrl ? (
          <>
            <strong>Server:</strong> not connected. A server syncs your budget
            across devices and keeps a backup of your data.
          </>
        ) : userData?.offline ? (
          <>
            <strong>Server:</strong> offline. Changes are saved locally and will
            sync once it's reachable again.
          </>
        ) : (
          <>
            <strong>Server:</strong> online. Your budget is syncing.
          </>
        )}
      </Text>
      {serverUrl && (
        <Text style={{ color: theme.pageTextSubdued }}>
          {multiuserEnabled && userData?.displayName ? (
            <>
              Signed in as {userData.displayName} on {serverUrl}
            </>
          ) : (
            <>Connected to {serverUrl}</>
          )}
        </Text>
      )}
    </Setting>
  );
}
