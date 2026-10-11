import React, { useEffect, useState } from 'react';

import { Button, ButtonWithLoading } from '@actual-app/components/button';
import { FormError } from '@actual-app/components/form-error';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { InlineField } from '@actual-app/components/inline-field';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';

import { duplicateBudget } from '#budgetfiles/budgetfilesSlice';
import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
} from '#components/common/Modal';
import type { Modal as ModalType } from '#modals/modalsSlice';
import { addNotification } from '#notifications/notificationsSlice';
import { useDispatch } from '#redux';

type DuplicateFileModalProps = Extract<
  ModalType,
  { name: 'duplicate-budget' }
>['options'];

export function DuplicateFileModal({
  file,
  managePage,
  loadBudget = 'none',
  onComplete,
}: DuplicateFileModalProps) {
  const [newName, setNewName] = useState(file.name + ' - copy');
  const [nameError, setNameError] = useState<string | null>(null);

  // If the state is "broken" that means it was created by another user.
  const isCloudFile = 'cloudFileId' in file && file.state !== 'broken';
  const isLocalFile = 'id' in file;
  const dispatch = useDispatch();

  const [loadingState, setLoadingState] = useState<'cloud' | 'local' | null>(
    null,
  );

  useEffect(() => {
    void (async () => {
      setNewName(await uniqueBudgetName(file.name + ' - copy'));
    })();
  }, [file.name]);

  const validateAndSetName = async (name: string) => {
    const trimmedName = name.trim();
    const { valid, message } = await validateBudgetName(trimmedName);
    if (valid) {
      setNewName(trimmedName);
      setNameError(null);
    } else {
      // The "Unknown error" should never happen, but this satifies type checking
      setNameError(message ?? 'Unknown error with budget name');
    }
  };

  const handleDuplicate = async (sync: 'localOnly' | 'cloudSync') => {
    const { valid, message } = await validateBudgetName(newName);
    if (valid) {
      setLoadingState(sync === 'cloudSync' ? 'cloud' : 'local');

      try {
        await dispatch(
          duplicateBudget({
            id: 'id' in file ? file.id : undefined,
            oldName: file.name,
            newName,
            cloudSync: sync === 'cloudSync',
            managePage,
            loadBudget,
          }),
        );
        dispatch(
          addNotification({
            notification: {
              type: 'message',
              message: `Duplicate file "${newName}" created.`,
            },
          }),
        );
        if (onComplete) onComplete({ status: 'success' });
      } catch (e) {
        const newError = new Error('Failed to duplicate budget file');
        if (onComplete) onComplete({ status: 'failed', error: newError });
        else console.error('Failed to duplicate budget file:', e);
        dispatch(
          addNotification({
            notification: {
              type: 'error',
              message: 'Failed to duplicate budget file.',
            },
          }),
        );
      } finally {
        setLoadingState(null);
      }
    } else {
      const failError = new Error(message ?? 'Unknown error with budget name');
      if (onComplete) onComplete({ status: 'failed', error: failError });
    }
  };

  return (
    <Modal name="duplicate-budget">
      {({ state }) => (
        <View style={{ maxWidth: 700 }}>
          <ModalHeader
            title={`Duplicate "${file.name}"`}
            rightContent={
              <ModalCloseButton
                onPress={() => {
                  state.close();
                  if (onComplete) onComplete({ status: 'canceled' });
                }}
              />
            }
          />

          <View
            style={{
              padding: 15,
              gap: 15,
              paddingTop: 0,
              paddingBottom: 25,
              lineHeight: '1.5em',
            }}
          >
            <InlineField label="New Budget Name" width="100%" labelWidth={150}>
              <InitialFocus>
                <Input
                  name="name"
                  value={newName}
                  aria-label="New Budget Name"
                  aria-invalid={nameError ? 'true' : 'false'}
                  onChangeValue={setNewName}
                  onUpdate={validateAndSetName}
                  style={{ flex: 1 }}
                />
              </InitialFocus>
            </InlineField>
            {nameError && (
              <FormError style={{ marginLeft: 150, color: theme.warningText }}>
                {nameError}
              </FormError>
            )}

            {isLocalFile ? (
              isCloudFile && (
                <Text>
                  Your budget is hosted on a server, making it accessible for
                  download on your devices.
                  <br />
                  Would you like to duplicate this budget for all your devices
                  or keep it stored locally on this device?
                </Text>
              )
            ) : (
              <Text>
                Unable to duplicate a budget that is not located on your device.
                <br />
                Please download the budget from the server before duplicating.
              </Text>
            )}
            <ModalButtons>
              <Button
                onPress={() => {
                  state.close();
                  if (onComplete) onComplete({ status: 'canceled' });
                }}
              >
                Cancel
              </Button>
              {isLocalFile && isCloudFile && (
                <ButtonWithLoading
                  variant={loadingState !== null ? 'bare' : 'primary'}
                  isLoading={loadingState === 'cloud'}
                  style={{
                    marginLeft: 10,
                  }}
                  onPress={() => handleDuplicate('cloudSync')}
                >
                  Duplicate for all devices
                </ButtonWithLoading>
              )}
              {isLocalFile && (
                <ButtonWithLoading
                  variant={
                    loadingState !== null
                      ? 'bare'
                      : isCloudFile
                        ? 'normal'
                        : 'primary'
                  }
                  isLoading={loadingState === 'local'}
                  style={{
                    marginLeft: 10,
                  }}
                  onPress={() => handleDuplicate('localOnly')}
                >
                  {isCloudFile ? 'Duplicate locally' : 'Duplicate'}
                </ButtonWithLoading>
              )}
            </ModalButtons>
          </View>
        </View>
      )}
    </Modal>
  );
}

async function validateBudgetName(name: string): Promise<{
  valid: boolean;
  message?: string;
}> {
  return send('validate-budget-name', { name });
}

async function uniqueBudgetName(name: string): Promise<string> {
  return send('unique-budget-name', { name });
}
