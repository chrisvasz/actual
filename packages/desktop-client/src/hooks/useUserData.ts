import { useCallback, useEffect, useState } from 'react';

import { listen } from '@actual-app/core/platform/client/connection';

import { useDispatch, useSelector } from '#redux';
import { getUserData } from '#users/usersSlice';

/**
 * Loads the signed-in user's data and refreshes it whenever a sync flips the
 * server between reachable and offline. Returns the user data plus whether a
 * load (or a sync) is in flight.
 */
export function useUserData() {
  const dispatch = useDispatch();
  const userData = useSelector(state => state.user.data);
  const [isLoading, setIsLoading] = useState(true);

  const initializeUserData = useCallback(async () => {
    try {
      await dispatch(getUserData());
    } catch (error) {
      console.error('Failed to initialize user data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [dispatch]);

  useEffect(() => {
    void initializeUserData();
  }, [initializeUserData]);

  useEffect(() => {
    return listen('sync-event', ({ type }) => {
      if (type === 'start') {
        setIsLoading(true);

        return;
      }

      const shouldReinitialize =
        userData &&
        ((type === 'success' && userData.offline) ||
          (type === 'error' && !userData.offline));

      if (shouldReinitialize) {
        void initializeUserData();
      } else {
        setIsLoading(false);
      }
    });
  }, [initializeUserData, userData]);

  return { userData, isLoading };
}
