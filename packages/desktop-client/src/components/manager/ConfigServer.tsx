// @ts-strict-ignore
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router';

import { Button, ButtonWithLoading } from '@actual-app/components/button';
import { BigInput } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { BackButton } from '#components/common/BackButton';
import { Link } from '#components/common/Link';
import { useServerURL, useSetServerURL } from '#components/ServerContext';
import { useNavigate } from '#hooks/useNavigate';
import { useDispatch, useSelector } from '#redux';
import { loggedIn, signOut } from '#users/usersSlice';

import { Title } from './subscribe/common';

export function ConfigServer() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const userData = useSelector(state => state.user.data);
  const [url, setUrl] = useState('');
  const currentUrl = useServerURL();
  const setServerUrl = useSetServerURL();
  useEffect(() => {
    setUrl(currentUrl);
  }, [currentUrl]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function getErrorMessage(error: string) {
    switch (error) {
      case 'network-failure':
        return 'Connection failed. If you use a self-signed certificate or were recently offline, try refreshing the page. Otherwise ensure you have HTTPS set up properly.';
      default:
        return 'Server does not look like an Actual server. Is it set up correctly?';
    }
  }

  async function onSubmit() {
    if (url === null || url === '' || loading) {
      return;
    }

    setError(null);
    setLoading(true);

    let httpUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      httpUrl = 'https://' + url;
    }

    const { error } = await setServerUrl(httpUrl);
    setUrl(httpUrl);

    if (error) {
      setLoading(false);
      setError(error);
    } else {
      setLoading(false);
      await dispatch(signOut());
      void navigate('/');
    }
  }

  function onSameDomain() {
    setUrl(window.location.origin);
  }

  async function onSkip() {
    await setServerUrl(null);
    await dispatch(loggedIn());
    void navigate('/');
  }

  return (
    <View style={{ maxWidth: 500, marginTop: -30 }}>
      {(userData || currentUrl) && (
        <BackButton
          onPress={() =>
            location.key !== 'default' ? navigate(-1) : navigate('/')
          }
          style={{
            position: 'fixed',
            top: 'calc(10px + env(safe-area-inset-top))',
            left: 10,
            margin: 0,
            zIndex: 4000,
          }}
        />
      )}
      <>
        <Title text={'Connect to a server'} />
        <Text
          style={{
            fontSize: 16,
            color: theme.tableRowHeaderText,
            lineHeight: 1.5,
          }}
        >
          {currentUrl ? (
            'Existing sessions will be logged out and you will log in to this server. We will validate that Actual is running at this URL.'
          ) : (
            'A sync server keeps your budget up to date across all your devices. It is completely optional: Actual works great on just this device too.'
          )}
        </Text>
        {!currentUrl && (
          <Text
            style={{
              fontSize: 16,
              color: theme.pageTextLight,
              lineHeight: 1.5,
              marginTop: 10,
            }}
          >
            
              If you already run a server, enter its URL below. Otherwise you
              can{' '}
              <Link
                variant="external"
                to="https://actualbudget.org/docs/install/"
                linkColor="purple"
              >
                learn how to set one up
              </Link>{' '}
              and connect it whenever you are ready.
            
          </Text>
        )}
        {error && (
          <Text
            style={{
              marginTop: 20,
              color: theme.errorText,
              borderRadius: 4,
              fontSize: 15,
            }}
          >
            {getErrorMessage(error)}
          </Text>
        )}
        <View style={{ display: 'flex', flexDirection: 'row', marginTop: 30 }}>
          <BigInput
            autoFocus
            placeholder={'https://example.com'}
            value={url || ''}
            onChangeValue={setUrl}
            style={{ flex: 1, marginRight: 10 }}
            onEnter={onSubmit}
          />
          <ButtonWithLoading
            variant="primary"
            isLoading={loading}
            style={{ fontSize: 15 }}
            onPress={onSubmit}
          >
            Connect
          </ButtonWithLoading>
        </View>
        <View
          style={{
            alignItems: 'center',
            gap: 15,
            marginTop: 30,
          }}
        >
          {currentUrl ? (
            <Button
              variant="bare"
              style={{ color: theme.pageTextLink }}
              onPress={onSkip}
            >
              Stop using a server
            </Button>
          ) : (
            <>
              <Button
                variant="bare"
                style={{ color: theme.pageTextLink }}
                onPress={onSameDomain}
              >
                Use the current domain
              </Button>
              {!userData && (
                <Button
                  variant="bare"
                  style={{ color: theme.pageTextLink }}
                  onPress={onSkip}
                >
                  Don't use a server
                </Button>
              )}
            </>
          )}
        </View>
      </>
    </View>
  );
}
