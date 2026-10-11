
import { send } from '@actual-app/core/platform/client/connection';
import type {
  AccountEntity,
  AccountGroupEntity,
  CategoryEntity,
  TransactionEntity,
} from '@actual-app/core/types/models';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';

import { addNotification } from '#notifications/notificationsSlice';
import { payeeQueries } from '#payees';
import { invalidateAndDeliver } from '#queries/invalidateAndDeliver';
import { useDispatch } from '#redux';
import type { AppDispatch } from '#redux/store';
import { setNewTransactions } from '#transactions/transactionsSlice';

import { markUpdatedAccounts } from './accountsSlice';
import { accountQueries } from './queries';

const invalidateQueries = (queryClient: QueryClient, queryKey?: QueryKey) => {
  void queryClient.invalidateQueries({
    queryKey: queryKey ?? accountQueries.lists(),
  });
};

const dispatchErrorNotification = (
  dispatch: AppDispatch,
  message: string,
  error?: Error,
) => {
  dispatch(
    addNotification({
      notification: {
        id: uuidv4(),
        type: 'error',
        message,
        pre: error ? error.message : undefined,
      },
    }),
  );
};

type CreateAccountPayload = {
  name: string;
  balance: number;
  offBudget: boolean;
};

export function useCreateAccountMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();

  return useMutation({
    mutationFn: async ({ name, balance, offBudget }: CreateAccountPayload) => {
      const id = await send('account-create', {
        name,
        balance,
        offBudget,
      });
      return id;
    },
    onSuccess: () => invalidateQueries(queryClient),
    onError: error => {
      console.error('Error creating account:', error);
      dispatchErrorNotification(
        dispatch,
        'There was an error creating the account. Please try again.',
        error,
      );
    },
  });
}

type CloseAccountPayload = {
  id: AccountEntity['id'];
  transferAccountId?: AccountEntity['id'];
  categoryId?: CategoryEntity['id'];
  forced?: boolean;
};

export function useCloseAccountMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();

  return useMutation({
    mutationFn: async ({
      id,
      transferAccountId,
      categoryId,
      forced,
    }: CloseAccountPayload) => {
      await send('account-close', {
        id,
        transferAccountId: transferAccountId || undefined,
        categoryId: categoryId || undefined,
        forced,
      });
    },
    onSuccess: () => invalidateQueries(queryClient),
    onError: error => {
      console.error('Error closing account:', error);
      dispatchErrorNotification(
        dispatch,
        'There was an error closing the account. Please try again.',
        error,
      );
    },
  });
}

type ReopenAccountPayload = {
  id: AccountEntity['id'];
};

export function useReopenAccountMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();

  return useMutation({
    mutationFn: async ({ id }: ReopenAccountPayload) => {
      await send('account-reopen', { id });
    },
    onSuccess: () => invalidateQueries(queryClient),
    onError: error => {
      console.error('Error re-opening account:', error);
      dispatchErrorNotification(
        dispatch,
        'There was an error re-opening the account. Please try again.',
        error,
      );
    },
  });
}

type UpdateAccountPayload = {
  account: Pick<AccountEntity, 'id'> & Partial<AccountEntity>;
};

export function useUpdateAccountMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();

  return useMutation({
    mutationFn: async ({ account }: UpdateAccountPayload) => {
      await send('account-update', account);
      return account;
    },
    // Resolve only once components have the new data; rename fields keep
    // showing the pending name until then.
    onSuccess: () => invalidateAndDeliver(queryClient, accountQueries.lists()),
    onError: error => {
      console.error('Error updating account:', error);
      dispatchErrorNotification(
        dispatch,
        'There was an error updating the account. Please try again.',
        error,
      );
    },
  });
}

type MoveAccountPayload = {
  id: AccountEntity['id'];
  targetId: AccountEntity['id'] | null;
  accountGroupId?: AccountGroupEntity['id'] | null;
};

export function useMoveAccountMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();

  return useMutation({
    mutationFn: async ({
      id,
      targetId,
      accountGroupId,
    }: MoveAccountPayload) => {
      await send('account-move', { id, targetId, accountGroupId });
    },
    onSuccess: () => {
      invalidateQueries(queryClient);
      invalidateQueries(queryClient, payeeQueries.lists());
    },
    onError: error => {
      console.error('Error moving account:', error);
      dispatchErrorNotification(
        dispatch,
        'There was an error moving the account. Please try again.',
        error,
      );
    },
  });
}

type ImportPreviewTransactionsPayload = {
  accountId: string;
  transactions: TransactionEntity[];
  reimportDeleted?: boolean;
};

export function useImportPreviewTransactionsMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();

  return useMutation({
    mutationFn: async ({
      accountId,
      transactions,
      reimportDeleted,
    }: ImportPreviewTransactionsPayload) => {
      const { errors = [], updatedPreview } = await send(
        'transactions-import',
        {
          accountId,
          transactions,
          isPreview: true,
          opts: reimportDeleted !== undefined ? { reimportDeleted } : undefined,
        },
      );

      errors.forEach(error => {
        dispatch(
          addNotification({
            notification: {
              type: 'error',
              message: error.message,
            },
          }),
        );
      });

      return updatedPreview;
    },
    onSuccess: () => invalidateQueries(queryClient),
    onError: error => {
      console.error('Error importing preview transactions to account:', error);
      dispatchErrorNotification(
        dispatch,
        'There was an error importing preview transactions to the account. Please try again.',
        error,
      );
    },
  });
}

type ImportTransactionsPayload = {
  accountId: string;
  transactions: TransactionEntity[];
  reconcile: boolean;
  reimportDeleted?: boolean;
};

export function useImportTransactionsMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();

  return useMutation({
    mutationFn: async ({
      accountId,
      transactions,
      reconcile,
      reimportDeleted,
    }: ImportTransactionsPayload) => {
      if (!reconcile) {
        await send('api/transactions-add', {
          accountId,
          transactions,
        });

        return true;
      }

      const {
        errors = [],
        added,
        updated,
      } = await send('transactions-import', {
        accountId,
        transactions,
        isPreview: false,
        opts: reimportDeleted !== undefined ? { reimportDeleted } : undefined,
      });

      errors.forEach(error => {
        dispatch(
          addNotification({
            notification: {
              type: 'error',
              message: error.message,
            },
          }),
        );
      });

      dispatch(
        setNewTransactions({
          newTransactions: added,
          matchedTransactions: updated,
        }),
      );

      dispatch(
        markUpdatedAccounts({
          ids: added.length > 0 ? [accountId] : [],
        }),
      );

      return added.length > 0 || updated.length > 0;
    },
    onSuccess: () => invalidateQueries(queryClient),
    onError: error => {
      console.error('Error importing transactions to account:', error);
      dispatchErrorNotification(
        dispatch,
        'There was an error importing transactions to the account. Please try again.',
        error,
      );
    },
  });
}
