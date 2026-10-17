import { v4 as uuidv4 } from 'uuid';

import { addNotification } from '#notifications/notificationsSlice';
import { useDispatch } from '#redux';

/**
 * Wraps an async call so a failure is logged and shown as an error
 * notification with `message`; the wrapped call then resolves undefined
 * rather than rejecting.
 */
export function useReportErrors<Args extends unknown[], Result>(
  message: string,
  call: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result | undefined> {
  const dispatch = useDispatch();

  return async (...args) => {
    try {
      return await call(...args);
    } catch (e) {
      const error = e as Error;
      console.error(message, error);
      dispatch(
        addNotification({
          notification: {
            id: uuidv4(),
            type: 'error',
            message,
            pre: error?.message,
          },
        }),
      );
      return undefined;
    }
  };
}
