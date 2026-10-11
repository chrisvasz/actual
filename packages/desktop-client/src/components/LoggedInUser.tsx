import React, { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Menu } from '@actual-app/components/menu';
import { Popover } from '@actual-app/components/popover';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { View } from '@actual-app/components/view';

import { closeBudget } from '#budgetfiles/budgetfilesSlice';
import { useNavigate } from '#hooks/useNavigate';
import { useUserData } from '#hooks/useUserData';
import { useDispatch } from '#redux';
import { signOut } from '#users/usersSlice';

import { useServerURL } from './ServerContext';

type LoggedInUserProps = {
  hideIfNoServer?: boolean;
  style?: CSSProperties;
};

export function LoggedInUser({ hideIfNoServer, style }: LoggedInUserProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { userData, isLoading: loading } = useUserData();
  const [menuOpen, setMenuOpen] = useState(false);
  const serverUrl = useServerURL();
  const triggerRef = useRef<HTMLButtonElement>(null);

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
        message: t('No server'),
        tooltip: (
          <Trans>
            A server syncs your budget across devices and keeps a backup of your
            data.
            <br />
            Click to set one up.
          </Trans>
        ),
      };
    }

    if (userData?.offline) {
      return {
        message: t('Server offline'),
        tooltip: (
          <Trans>
            Can't reach your server right now.
            <br />
            Changes are saved locally and will sync once it's reachable again.
          </Trans>
        ),
      };
    }

    return {
      message: t('Server online'),
      tooltip: (
        <Trans>Connected to your server — your budget is syncing.</Trans>
      ),
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
        <Trans>Connecting...</Trans>
      </Text>
    );
  }

  type MenuItem = {
    name: string;
    text: string;
  };

  const getMenuItems = (): MenuItem[] => {
    const items: MenuItem[] = [];
    if (
      serverUrl &&
      !userData?.offline &&
      userData?.loginMethod === 'password'
    ) {
      items.push({ name: 'change-password', text: t('Change password') });
    }
    if (serverUrl) {
      items.push({ name: 'sign-out', text: t('Sign out') });
    }
    items.push({
      name: 'config-server',
      text: serverUrl ? t('Change server URL') : t('Start using a server'),
    });

    return items;
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
      <Popover
        offset={8}
        triggerRef={triggerRef}
        isOpen={menuOpen}
        onOpenChange={() => setMenuOpen(false)}
      >
        <Menu onMenuSelect={handleMenuSelect} items={getMenuItems()} />
      </Popover>
    </View>
  );
}
