import React, { useState } from 'react';

import { ButtonWithLoading } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';

import { resetSync } from '#app/appSlice';
import { useMetadataPref } from '#hooks/useMetadataPref';
import { useDispatch } from '#redux';

import { Setting } from './UI';

export function ResetSync() {
  const [groupId] = useMetadataPref('groupId');
  const isEnabled = !!groupId;
  const dispatch = useDispatch();

  const [resetting, setResetting] = useState(false);

  async function onResetSync() {
    setResetting(true);
    await dispatch(resetSync());
    setResetting(false);
  }

  return (
    <Setting
      primaryAction={
        <ButtonWithLoading
          isLoading={resetting}
          isDisabled={!isEnabled}
          onPress={onResetSync}
        >
          Reset sync
        </ButtonWithLoading>
      }
    >
      {isEnabled ? (
        <Text>
          <strong>Reset sync</strong> will remove all local data used to track
          changes for syncing, and create a fresh sync ID on the server. This
          file on other devices will have to be re-downloaded to use the new
          sync ID. Use this if there is a problem with syncing and you want to
          start fresh.
        </Text>
      ) : (
        <Text>
          <strong>Reset sync</strong> is only available when syncing is enabled.
        </Text>
      )}
    </Setting>
  );
}
