import React, { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useLocation } from 'react-router';

import { Button } from '@actual-app/components/button';
import { Menu } from '@actual-app/components/menu';
import { Popover } from '@actual-app/components/popover';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { View } from '@actual-app/components/view';
import type { RemoteFile, SyncedLocalFile } from '@actual-app/core/types/file';

import { useAuth } from '#auth/AuthProvider';
import { Permissions } from '#auth/types';
import { closeBudget } from '#budgetfiles/budgetfilesSlice';
import { useMetadataPref } from '#hooks/useMetadataPref';
import { useNavigate } from '#hooks/useNavigate';
import { useUserData } from '#hooks/useUserData';
import { useDispatch, useSelector } from '#redux';
import { signOut } from '#users/usersSlice';

import { useMultiuserEnabled, useServerURL } from './ServerContext';

type LoggedInUserProps = {
  hideIfNoServer?: boolean;
  style?: CSSProperties;
};

export function LoggedInUser({ hideIfNoServer, style }: LoggedInUserProps) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { userData, isLoading: loading } = useUserData();
  const [menuOpen, setMenuOpen] = useState(false);
  const serverUrl = useServerURL();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [budgetId] = useMetadataPref('id');
  const [cloudFileId] = useMetadataPref('cloudFileId');
  const location = useLocation();
  const { hasPermission } = useAuth();
  const multiuserEnabled = useMultiuserEnabled();
  const allFiles = useSelector(state => state.budgetfiles.allFiles || []);
  const remoteFiles = allFiles.filter(
    f => f.state === 'remote' || f.state === 'synced' || f.state === 'detached',
  ) as (SyncedLocalFile | RemoteFile)[];
  const currentFile = remoteFiles.find(f => f.cloudFileId === cloudFileId);
  const hasSyncedPrefs = useSelector(state => state.prefs.synced);

  async function onCloseBudget() {
    await dispatch(closeBudget());
  }

  async function onChangePassword() {
    await onCloseBudget();
    void navigate('/change-password');
  }

  const handleMenuSelect = async (type: string) => {
    setMenuOpen(false);

    switch (type) {
      case 'change-password':
        void onChangePassword();
        break;
      case 'sign-in':
        await onCloseBudget();
        void navigate('/login');
        break;
      case 'user-access':
        void navigate('/user-access');
        break;
      case 'user-directory':
        void navigate('/user-directory');
        break;
      case 'index':
        void navigate('/');
        break;
      case 'sign-out':
        void dispatch(signOut());
        break;
      case 'config-server':
        await onCloseBudget();
        void navigate('/config-server');
        break;
      default:
        break;
    }
  };

  function getServerStatus() {
    if (!serverUrl) {
      return {
        message: 'No server',
        tooltip: (
          <>
            A server syncs your budget across devices and keeps a backup of your
            data.
            <br />
            Click to set one up.
          </>
        ),
      };
    }

    if (userData?.offline) {
      return {
        message: 'Server offline',
        tooltip: (
          <>
            Can't reach your server right now.
            <br />
            Changes are saved locally and will sync once it's reachable again.
          </>
        ),
      };
    }

    return {
      message: 'Server online',
      tooltip: 'Connected to your server — your budget is syncing.',
    };
  }

  if (hideIfNoServer && !serverUrl) return null;

  if (loading && serverUrl) {
    return (
      <Text
        style={{
          color: theme.pageTextLight,
          fontStyle: 'italic',
          ...styles.delayedFadeIn,
          ...style,
        }}
      >
        Connecting...
      </Text>
    );
  }

  type MenuItem = {
    name: string;
    text: string;
  };

  const getMenuItems = (): (MenuItem | typeof Menu.line)[] => {
    const isAdmin = hasPermission(Permissions.ADMINISTRATOR);

    const baseMenu: (MenuItem | typeof Menu.line)[] = [];
    if (
      serverUrl &&
      !userData?.offline &&
      userData?.loginMethod === 'password'
    ) {
      baseMenu.push({ name: 'change-password', text: 'Change password' });
    }
    if (serverUrl) {
      baseMenu.push({ name: 'sign-out', text: 'Sign out' });
    }
    baseMenu.push({
      name: 'config-server',
      text: serverUrl ? 'Change server URL' : 'Start using a server',
    });

    const adminMenu: (MenuItem | typeof Menu.line)[] = [];
    if (multiuserEnabled && isAdmin) {
      if (!budgetId && location.pathname !== '/') {
        adminMenu.push({ name: 'index', text: 'View file list' });
      } else if (
        serverUrl &&
        !userData?.offline &&
        location.pathname !== '/user-directory'
      ) {
        adminMenu.push({ name: 'user-directory', text: 'User Directory' });
      }
    }

    if (
      multiuserEnabled &&
      ((currentFile && userData && currentFile.owner === userData.userId) ||
        isAdmin) &&
      serverUrl &&
      !userData?.offline &&
      cloudFileId &&
      location.pathname !== '/user-access'
    ) {
      adminMenu.push({
        name: 'user-access',
        text: 'User Access Management',
      });
    }

    if (adminMenu.length > 0) {
      adminMenu.push(Menu.line);
    }

    return [...adminMenu, ...baseMenu];
  };

  const serverStatus = getServerStatus();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', ...style }}>
      <Tooltip
        placement="bottom end"
        content={serverStatus.tooltip}
        triggerProps={{ isDisabled: menuOpen }}
      >
        <Button
          ref={triggerRef}
          variant="bare"
          onPress={() => setMenuOpen(true)}
        >
          {serverStatus.message}
        </Button>
      </Tooltip>
      {!loading &&
        multiuserEnabled &&
        userData &&
        userData?.displayName &&
        !hasSyncedPrefs && (
          <small>
            (logged in as: <span>{userData?.displayName}</span>)
          </small>
        )}
      {!loading &&
        multiuserEnabled &&
        userData &&
        userData?.displayName &&
        hasSyncedPrefs && (
          <small>
            (logged in as: <span>{userData?.displayName}</span>)
          </small>
        )}

      <Popover
        offset={8}
        triggerRef={triggerRef}
        isOpen={menuOpen}
        onOpenChange={() => setMenuOpen(false)}
      >
        <Menu
          onMenuSelect={handleMenuSelect}
          items={getMenuItems().filter(Boolean)}
        />
      </Popover>
    </View>
  );
}
