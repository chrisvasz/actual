import React from 'react';
import { Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { useTour } from '#components/tour/TourContext';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

import { Setting } from './UI';

export function HelpSettings() {
  const dispatch = useDispatch();
  const { startTour } = useTour();

  return (
    <Setting
      primaryAction={
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Button
            onPress={() =>
              window.Actual.openURLInBrowser('https://actualbudget.org/docs')
            }
          >
            <Trans>Documentation</Trans>
          </Button>
          <Button
            onPress={() =>
              window.Actual.openURLInBrowser('https://discord.gg/pRYNYr4W5A')
            }
          >
            <Trans>Community support (Discord)</Trans>
          </Button>
          <Button
            onPress={() =>
              dispatch(pushModal({ modal: { name: 'keyboard-shortcuts' } }))
            }
          >
            <Trans>Keyboard shortcuts</Trans>
          </Button>
          <Button onPress={() => startTour()}>
            <Trans>Take a tour</Trans>
          </Button>
        </View>
      }
    >
      <Text>
        <Trans>
          <strong>Help</strong> is a click away: read the docs, ask the
          community, or replay the getting-started tour.
        </Trans>
      </Text>
    </Setting>
  );
}
