import React, { useLayoutEffect } from 'react';

import { Button } from '@actual-app/components/button';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { Paragraph } from '@actual-app/components/paragraph';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { BuiltInProviders } from '#components/banksync/BuiltInProviders';
import { useBuiltInBankSyncProviders } from '#components/banksync/useBuiltInBankSyncProviders';
import { Link } from '#components/common/Link';
import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { useNavigate } from '#hooks/useNavigate';
import { pushModal, replaceModal } from '#modals/modalsSlice';
import type { Modal as ModalType } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

type CreateAccountModalProps = Extract<
  ModalType,
  { name: 'add-account' }
>['options'];

export function CreateAccountModal({
  upgradingAccountId,
}: CreateAccountModalProps) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { providers, syncServerStatus, permissionWarning } =
    useBuiltInBankSyncProviders({ upgradingAccountId });

  const onCreateLocalAccount = () => {
    dispatch(pushModal({ modal: { name: 'add-local-account' } }));
  };

  const isUsingServer = syncServerStatus !== 'no-server';
  const shouldSkipToLocalAccount = !isUsingServer && upgradingAccountId == null;

  useLayoutEffect(() => {
    if (shouldSkipToLocalAccount) {
      dispatch(replaceModal({ modal: { name: 'add-local-account' } }));
    }
  }, [dispatch, shouldSkipToLocalAccount]);

  let title = 'Add account';

  if (upgradingAccountId != null) {
    title = 'Link account';
  }

  if (shouldSkipToLocalAccount) {
    return null;
  }

  return (
    <Modal name="add-account">
      {({ state }) => (
        <>
          <ModalHeader
            title={title}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View
            style={{
              maxWidth: upgradingAccountId == null ? 500 : 720,
              gap: 24,
              color: theme.pageText,
            }}
          >
            {upgradingAccountId != null ? (
              <>
                <Paragraph
                  style={{ fontSize: 15, color: theme.pageTextSubdued }}
                >
                  Choose a bank sync provider to connect this account.
                </Paragraph>
                <BuiltInProviders
                  providers={providers}
                  syncServerStatus={syncServerStatus}
                  permissionWarning={permissionWarning}
                />
              </>
            ) : (
              <>
                <View style={{ gap: 10 }}>
                  <InitialFocus>
                    <Button
                      variant="primary"
                      style={{
                        padding: '10px 0',
                        fontSize: 15,
                        fontWeight: 600,
                      }}
                      onPress={onCreateLocalAccount}
                    >
                      Create a local account
                    </Button>
                  </InitialFocus>
                  <View style={{ lineHeight: '1.4em', fontSize: 15 }}>
                    <Text>
                      <strong>Create a local account</strong> if you want to add
                      transactions manually. You can also{' '}
                      <Link
                        variant="external"
                        to="https://actualbudget.org/docs/transactions/importing"
                        linkColor="muted"
                      >
                        import QIF/OFX/QFX files into a local account
                      </Link>
                      .
                    </Text>
                  </View>
                </View>

                <View style={{ gap: 10 }}>
                  <Button
                    onPress={() => {
                      state.close();
                      void navigate('/bank-sync');
                    }}
                    style={{
                      padding: '10px 0',
                      fontSize: 15,
                      fontWeight: 600,
                    }}
                  >
                    Set up bank sync
                  </Button>
                  <Paragraph
                    style={{ fontSize: 15, color: theme.pageTextSubdued }}
                  >
                    Configure providers and link accounts from the Bank Sync
                    page.
                  </Paragraph>
                </View>
              </>
            )}
          </View>
        </>
      )}
    </Modal>
  );
}
