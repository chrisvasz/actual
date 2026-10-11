import React from 'react';
import { useLocation } from 'react-router';

import { Button } from '@actual-app/components/button';
import { Paragraph } from '@actual-app/components/paragraph';
import { SpaceBetween } from '@actual-app/components/space-between';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { send } from '@actual-app/core/platform/client/connection';
import type { PayeeEntity } from '@actual-app/core/types/models';

import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { DisplayId } from '#components/util/DisplayId';
import { useFormatList } from '#hooks/useFormatList';
import { popModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

export function PostsOfflineNotification() {
  const location = useLocation();
  const dispatch = useDispatch();

  const locationState = location.state;
  const payees =
    locationState && 'payees' in locationState
      ? (locationState.payees as Array<PayeeEntity['id']>)
      : [];

  async function onPost() {
    await send('schedule/force-run-service');
    dispatch(popModal());
  }

  const payeesList = payees.map(id => (
    <Text key={id} style={{ color: theme.pageTextPositive }}>
      <DisplayId id={id} type="payees" />
    </Text>
  ));
  const payeeNamesList = useFormatList(payeesList);

  return (
    <Modal name="schedule-posts-offline-notification">
      {({ state }) => (
        <>
          <ModalHeader
            title="Post transactions?"
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <Paragraph>
            <Text>
              {payees.length === 1 ? (
                <>
                  The payee <span>{payeeNamesList}</span> has a schedule that is
                  due today.
                </>
              ) : payees.length > 1 ? (
                <>
                  The payees <span>{payeeNamesList}</span> have schedules that
                  are due today.
                </>
              ) : (
                'There are payees that have schedules that are due today.'
              )}{' '}
              Usually we automatically post transactions for these, but you are
              offline or syncing failed. In order to avoid duplicate
              transactions, we let you choose whether or not to create
              transactions for these schedules.
            </Text>
          </Paragraph>
          <Paragraph>
            Be aware that other devices may have already created these
            transactions. If you have multiple devices, make sure you only do
            this on one device or you will have duplicate transactions.
          </Paragraph>
          <Paragraph>
            You can always manually post a transaction later for a due schedule
            by selecting the schedule and clicking "Post transaction today" in
            the action menu.
          </Paragraph>
          <SpaceBetween
            gap={10}
            style={{ marginTop: 20, justifyContent: 'flex-end' }}
          >
            <Button onPress={() => state.close()}>Decide later</Button>
            <Button
              variant="primary"
              autoFocus
              onPress={() => {
                void onPost();
                state.close();
              }}
            >
              Post transactions
            </Button>
          </SpaceBetween>
        </>
      )}
    </Modal>
  );
}
