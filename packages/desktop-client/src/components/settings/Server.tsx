import React from 'react';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { closeBudget } from '#budgetfiles/budgetfilesSlice';
import { useServerURL } from '#components/ServerContext';
import { useNavigate } from '#hooks/useNavigate';
import { useDispatch, useSelector } from '#redux';
import { signOut } from '#users/usersSlice';

import { Setting } from './UI';

export function ServerSettings() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const serverUrl = useServerURL();
  const userData = useSelector(state => state.user.data);

  const isOnline = Boolean(serverUrl && userData && !userData.offline);

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
          <>Connected to {serverUrl}</>
        </Text>
      )}
    </Setting>
  );
}
