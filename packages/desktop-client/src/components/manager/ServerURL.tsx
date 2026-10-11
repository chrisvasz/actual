import React from 'react';

import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { Link } from '#components/common/Link';
import { useServerURL } from '#components/ServerContext';

export function ServerURL() {
  const url = useServerURL();

  return (
    <View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        justifyContent: 'center',
        flexDirection: 'row',
        marginBottom: 'calc(15px + env(safe-area-inset-bottom))',
        zIndex: 5000,
      }}
    >
      <Text>
        {url ? (
          <>
            Using server: <strong>{url}</strong>
          </>
        ) : (
          'Using this device only'
        )}
      </Text>
      <Link variant="internal" to="/config-server" style={{ marginLeft: 15 }}>
        {url ? 'Change' : 'Set up sync'}
      </Link>
    </View>
  );
}
