// @ts-strict-ignore
import React from 'react';

import { Block } from '@actual-app/components/block';
import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { styles } from '@actual-app/components/styles';
import { View } from '@actual-app/components/view';

import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import type { Modal as ModalType } from '#modals/modalsSlice';

type ConfirmTransactionEditModalProps = Extract<
  ModalType,
  { name: 'confirm-transaction-edit' }
>['options'];

export function ConfirmTransactionEditModal({
  onCancel,
  onConfirm,
  confirmReason,
}: ConfirmTransactionEditModalProps) {
  const { isNarrowWidth } = useResponsive();
  const narrowButtonStyle = isNarrowWidth
    ? {
        height: styles.mobileMinHeight,
      }
    : {};

  return (
    <Modal
      name="confirm-transaction-edit"
      containerProps={{ style: { width: '30vw' } }}
    >
      {({ state }) => (
        <>
          <ModalHeader
            title="Reconciled Transaction"
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View style={{ lineHeight: 1.5 }}>
            {confirmReason === 'batchDeleteWithReconciledTransfer' ? (
              <Block>
                This transfer has a linked transaction in another account that
                is reconciled. Deleting it may bring that account's
                reconciliation out of balance.
              </Block>
            ) : confirmReason === 'batchDeleteWithReconciled' ? (
              <Block>
                Deleting reconciled transactions may bring your reconciliation
                out of balance.
              </Block>
            ) : confirmReason === 'batchEditWithReconciledTransfer' ? (
              <Block>
                This transfer has a linked transaction in another account that
                is reconciled. Editing it may bring that account's
                reconciliation out of balance.
              </Block>
            ) : confirmReason === 'batchEditWithReconciled' ? (
              <Block>
                Editing reconciled transactions may bring your reconciliation
                out of balance.
              </Block>
            ) : confirmReason === 'editReconciled' ? (
              <Block>
                Saving your changes to this reconciled transaction may bring
                your reconciliation out of balance.
              </Block>
            ) : confirmReason === 'unlockReconciled' ? (
              <Block>
                Unlocking this transaction means you won't be warned about
                changes that can impact your reconciled balance. (Changes to
                amount, account, payee, etc).
              </Block>
            ) : confirmReason === 'deleteReconciled' ? (
              <Block>
                Deleting reconciled transactions may bring your reconciliation
                out of balance.
              </Block>
            ) : (
              <Block>Are you sure you want to edit this transaction?</Block>
            )}
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
                }}
                onPress={() => {
                  state.close();
                  onCancel();
                }}
              >
                Cancel
              </Button>
              <InitialFocus>
                <Button
                  aria-label="Confirm"
                  variant="primary"
                  style={{
                    marginRight: 10,
                    ...narrowButtonStyle,
                  }}
                  onPress={() => {
                    state.close();
                    onConfirm();
                  }}
                >
                  Confirm
                </Button>
              </InitialFocus>
            </View>
          </View>
        </>
      )}
    </Modal>
  );
}
