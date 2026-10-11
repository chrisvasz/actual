import React, { useState } from 'react';

import { Button, ButtonWithLoading } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { deleteBudget } from '#budgetfiles/budgetfilesSlice';
import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { useSyncServerStatus } from '#hooks/useSyncServerStatus';
import type { Modal as ModalType } from '#modals/modalsSlice';
import { useDispatch, useSelector } from '#redux';

type DeleteFileModalProps = Extract<
  ModalType,
  { name: 'delete-budget' }
>['options'];

export function DeleteFileModal({ file }: DeleteFileModalProps) {
  // If the state is "broken" that means it was created by another
  // user. The current user should be able to delete the local file,
  // but not the remote one
  const isCloudFile = 'cloudFileId' in file && file.state !== 'broken';
  const serverStatus = useSyncServerStatus();
  const dispatch = useDispatch();

  // Get current user info to check ownership
  const userData = useSelector(state => state.user.data);
  const currentUserId = userData?.userId;

  // Check if current user is the owner or has admin permissions
  const isOwner = 'owner' in file && file.owner === currentUserId;
  const isAdmin = userData?.permission === 'ADMIN';
  const canDeleteFromServer = isOwner || isAdmin;

  const [loadingState, setLoadingState] = useState<'cloud' | 'local' | null>(
    null,
  );

  return (
    <Modal name="delete-budget">
      {({ state }) => (
        <>
          <ModalHeader
            title={`Delete ${file.name}`}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View
            style={{
              padding: 15,
              gap: 15,
              paddingTop: 0,
              paddingBottom: 25,
              maxWidth: 512,
              lineHeight: '1.5em',
            }}
          >
            {isCloudFile &&
              (canDeleteFromServer ? (
                <>
                  <Text>
                    This is a <strong>hosted file</strong> which means it is
                    stored on your server to make it available for download on
                    any device. You can delete it from the server, which will
                    also remove it from all of your devices.
                  </Text>

                  {serverStatus === 'online' ? (
                    <ButtonWithLoading
                      variant="primary"
                      isLoading={loadingState === 'cloud'}
                      style={{
                        backgroundColor: theme.errorText,
                        alignSelf: 'center',
                        border: 0,
                        padding: '10px 30px',
                        fontSize: 14,
                      }}
                      onPress={async () => {
                        setLoadingState('cloud');
                        await dispatch(
                          deleteBudget({
                            id: 'id' in file ? file.id : undefined,
                            cloudFileId: file.cloudFileId,
                          }),
                        );
                        setLoadingState(null);

                        state.close();
                      }}
                    >
                      Delete file from all devices
                    </ButtonWithLoading>
                  ) : (
                    <Button
                      isDisabled
                      style={{
                        alignSelf: 'center',
                        padding: '10px 30px',
                        fontSize: 14,
                      }}
                    >
                      Server is not available
                    </Button>
                  )}
                </>
              ) : (
                <Text>
                  This is a <strong>hosted file</strong> shared with you. Only
                  the file owner can delete it from the server.
                </Text>
              ))}

            {'id' in file && (
              <>
                {isCloudFile ? (
                  <Text>
                    You can also delete just the local copy. This will remove
                    all local data and the file will be listed as available for
                    download.
                  </Text>
                ) : (
                  <Text>
                    {file.state === 'broken' ? (
                      <>
                        This is a <strong>hosted file</strong> but it was
                        created by another user. You can only delete the local
                        copy.
                      </>
                    ) : (
                      <>
                        This a <strong>local file</strong> which is not stored
                        on a server.
                      </>
                    )}{' '}
                    Deleting it will remove it and all of its backups
                    permanently.
                  </Text>
                )}

                <ButtonWithLoading
                  variant={isCloudFile ? 'normal' : 'primary'}
                  isLoading={loadingState === 'local'}
                  style={{
                    alignSelf: 'center',
                    marginTop: 10,
                    padding: '10px 30px',
                    fontSize: 14,
                    ...(isCloudFile
                      ? {
                          color: theme.errorText,
                          borderColor: theme.errorText,
                        }
                      : {
                          border: 0,
                          backgroundColor: theme.errorText,
                        }),
                  }}
                  onPress={async () => {
                    setLoadingState('local');
                    await dispatch(deleteBudget({ id: file.id }));
                    setLoadingState(null);

                    state.close();
                  }}
                >
                  Delete file locally
                </ButtonWithLoading>
              </>
            )}
          </View>
        </>
      )}
    </Modal>
  );
}
