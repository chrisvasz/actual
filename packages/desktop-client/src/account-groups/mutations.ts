import { send } from '@actual-app/core/platform/client/connection';
import type { AccountGroupEntity } from '@actual-app/core/types/models';

import { useReportErrors } from '#hooks/useReportErrors';

// Live reads pick up each change once it's applied, so these only send it

export function useCreateAccountGroup() {
  return useReportErrors(
    'There was an error creating the account group. Please try again.',
    ({ name }: Pick<AccountGroupEntity, 'name'>) =>
      send('account-group-create', { name }),
  );
}

export function useUpdateAccountGroup() {
  return useReportErrors(
    'There was an error updating the account group. Please try again.',
    ({ id, name }: Pick<AccountGroupEntity, 'id' | 'name'>) =>
      send('account-group-update', { id, name }),
  );
}

export function useDeleteAccountGroup() {
  return useReportErrors(
    'There was an error deleting the account group. Please try again.',
    ({ id }: Pick<AccountGroupEntity, 'id'>) =>
      send('account-group-delete', { id }),
  );
}

type MoveAccountGroupPayload = {
  id: AccountGroupEntity['id'];
  targetId: AccountGroupEntity['id'] | null;
};

export function useMoveAccountGroup() {
  return useReportErrors(
    'There was an error moving the account group. Please try again.',
    ({ id, targetId }: MoveAccountGroupPayload) =>
      send('account-group-move', { id, targetId }),
  );
}
