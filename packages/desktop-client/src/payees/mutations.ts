import { send } from '@actual-app/core/platform/client/connection';
import type { PayeeEntity } from '@actual-app/core/types/models';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';

import { useReportErrors } from '#hooks/useReportErrors';
import { addNotification } from '#notifications/notificationsSlice';
import { useDispatch } from '#redux';
import type { AppDispatch } from '#redux/store';

import { locationService } from './location';
import { payeeQueries } from './queries';

function dispatchErrorNotification(
  dispatch: AppDispatch,
  message: string,
  error?: Error,
) {
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
}

export function useDeletePayeeLocationMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();

  return useMutation({
    mutationFn: async (locationId: string) => {
      await locationService.deletePayeeLocation(locationId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: payeeQueries.listNearby().queryKey,
      });
    },
    onError: error => {
      console.error('Error deleting payee location:', error);
      dispatchErrorNotification(
        dispatch,
        'There was an error forgetting the location. Please try again.',
        error,
      );
    },
  });
}

export function useSavePayeeLocationMutation() {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();

  return useMutation({
    mutationFn: async (payeeId: PayeeEntity['id']) => {
      const coords = await locationService.getCurrentPosition();
      await locationService.savePayeeLocation(payeeId, coords);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: payeeQueries.listNearby().queryKey,
      });
    },
    onError: error => {
      console.error('Error saving payee location:', error);
      dispatchErrorNotification(
        dispatch,
        'There was an error saving the location. Please try again.',
        error,
      );
    },
  });
}

export function useCreatePayee() {
  return useReportErrors(
    'There was an error creating the payee. Please try again.',
    ({ name }: Pick<PayeeEntity, 'name'>): Promise<PayeeEntity['id']> =>
      send('payee-create', { name: name.trim() }),
  );
}
