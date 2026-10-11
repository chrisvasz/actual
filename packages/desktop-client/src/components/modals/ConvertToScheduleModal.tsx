import React from 'react';

import { Block } from '@actual-app/components/block';
import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import type { Modal as ModalType } from '#modals/modalsSlice';

type ConvertToScheduleModalProps = Extract<
  ModalType,
  { name: 'convert-to-schedule' }
>['options'];

export function ConvertToScheduleModal({
  onCancel,
  onConfirm,
  daysUntilTransaction,
  upcomingDays,
}: ConvertToScheduleModalProps) {
  const { isNarrowWidth } = useResponsive();
  const narrowButtonStyle = isNarrowWidth
    ? {
        height: styles.mobileMinHeight,
      }
    : {};

  return (
    <Modal
      name="convert-to-schedule"
      containerProps={{ style: { width: '30vw' } }}
    >
      {({ state }) => (
        <>
          <ModalHeader
            title="Convert to Schedule"
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View style={{ lineHeight: 1.5 }}>
            <Block
              style={{
                marginTop: 10,
                padding: 10,
                backgroundColor: theme.warningBackground,
                borderRadius: 4,
              }}
            >
              <strong>Warning:</strong> This transaction is{' '}
              {daysUntilTransaction} days away, which is beyond your configured
              upcoming length of {upcomingDays} days. The schedule preview will
              not be visible in your account until it gets closer to the date.
            </Block>
            <View
              style={{
                marginTop: 20,
                flexDirection: 'row',
                justifyContent: 'flex-end',
              }}
            >
              <Button
                aria-label="Cancel"
                style={{
                  marginRight: 10,
                  ...narrowButtonStyle,
                  ...(isNarrowWidth && { flex: 1 }),
                }}
                onPress={() => {
                  state.close();
                  onCancel?.();
                }}
              >
                Cancel
              </Button>
              <InitialFocus>
                <Button
                  aria-label="Convert to Schedule"
                  variant="primary"
                  style={{
                    ...narrowButtonStyle,
                    ...(isNarrowWidth && { flex: 1 }),
                  }}
                  onPress={() => {
                    state.close();
                    onConfirm();
                  }}
                >
                  Create schedule anyway
                </Button>
              </InitialFocus>
            </View>
          </View>
        </>
      )}
    </Modal>
  );
}
