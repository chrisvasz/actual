import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { isElectron } from '@actual-app/core/shared/environment';

import { addNotification } from '#notifications/notificationsSlice';
import { useDispatch } from '#redux';

/**
 * Raises a sticky warning when the environment lacks SharedArrayBuffer, which
 * the app needs to run reliably in the browser.
 */
export function useSharedArrayBufferWarning() {
  const { t } = useTranslation();
  const dispatch = useDispatch();

  useEffect(() => {
    // Only warn if SharedArrayBuffer is required and not supported
    if (isElectron() || typeof SharedArrayBuffer !== 'undefined') {
      return;
    }

    dispatch(
      addNotification({
        notification: {
          id: 'shared-array-buffer',
          type: 'warning',
          sticky: true,
          title: t('SharedArrayBuffer is not supported'),
          message: t(
            'Your environment does not support SharedArrayBuffer. You may experience data loss or degraded functionality.',
          ),
          button: {
            title: t('Learn more'),
            action: () =>
              window.Actual.openURLInBrowser(
                'https://actualbudget.org/docs/troubleshooting/shared-array-buffer',
              ),
          },
        },
      }),
    );
  }, [dispatch, t]);
}
