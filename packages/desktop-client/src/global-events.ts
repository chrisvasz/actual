import { listen, send } from '@actual-app/core/platform/client/connection';
import * as undo from '@actual-app/core/platform/client/undo';
// @ts-strict-ignore
import type { QueryClient } from '@tanstack/react-query';

import { setAppState } from './app/appSlice';
import { categoryQueries } from './budget';
import { closeBudgetUI } from './budgetfiles/budgetfilesSlice';
import { closeModal, pushModal, replaceModal } from './modals/modalsSlice';
import type { Modal } from './modals/modalsSlice';
import {
  addGenericErrorNotification,
  addNotification,
} from './notifications/notificationsSlice';
import { loadPrefs } from './prefs/prefsSlice';
import type { AppStore } from './redux/store';
import * as syncEvents from './sync-events';

export function handleGlobalEvents(store: AppStore, queryClient: QueryClient) {
  const unlistenServerError = listen('server-error', () => {
    store.dispatch(addGenericErrorNotification());
  });

  const unlistenOrphanedPayees = listen(
    'orphaned-payees',
    ({ orphanedIds, updatedPayeeIds }) => {
      // Right now, it prompts to merge into the first payee
      store.dispatch(
        pushModal({
          modal: {
            name: 'merge-unused-payees',
            options: {
              payeeIds: orphanedIds,
              targetPayeeId: updatedPayeeIds[0],
            },
          },
        }),
      );
    },
  );

  const unlistenSchedulesOffline = listen('schedules-offline', () => {
    store.dispatch(
      pushModal({ modal: { name: 'schedule-posts-offline-notification' } }),
    );
  });

  const unlistenSync = syncEvents.listenForSyncEvent(store, queryClient);

  const unlistenUndo = listen('undo-event', undoState => {
    const { tables, undoTag } = undoState;
    const promises: Promise<unknown>[] = [];

    if (
      tables.includes('categories') ||
      tables.includes('category_groups') ||
      tables.includes('category_mapping')
    ) {
      promises.push(
        queryClient.invalidateQueries({
          queryKey: categoryQueries.lists(),
        }),
      );
    }

    const tagged = undo.getTaggedState(undoTag);

    if (tagged) {
      void Promise.all(promises).then(() => {
        // The undo is left pending only for a modal or screen this opens,
        // and whichever one acts on it on mount clears it. A modal or screen
        // that is already showing handles it through its own `undo-event`
        // listener. Any older pending undo is superseded by this one.
        undo.setUndoState('undoEvent', null);

        // If a modal has been tagged, open it instead of navigating
        if (tagged.openModal) {
          // The undo store keeps modals as an opaque structural shape; re-narrow
          // to the real Modal union now that we're back in desktop-client.
          // TODO: drop this cast once the Modal type lives somewhere both
          // loot-core and desktop-client can import (e.g. consolidated under
          // @actual-app/core types).
          const openModal = tagged.openModal as Modal;
          const { modalStack } = store.getState().modals;

          if (
            modalStack.length === 0 ||
            modalStack[modalStack.length - 1].name !== openModal.name
          ) {
            undo.setUndoState('undoEvent', undoState);
            store.dispatch(replaceModal({ modal: openModal }));
          }
        } else {
          store.dispatch(closeModal());

          if (
            window.location.href.replace(window.location.origin, '') !==
            tagged.url
          ) {
            undo.setUndoState('undoEvent', undoState);
            void window.__navigate(tagged.url);
            // This stops propagation of the undo event, which is
            // important because if we are changing URLs any existing
            // undo listeners on the current page don't need to be run
            return true;
          }
        }
      });
    }
  });

  const unlistenStorageWriteError = listen('storage-write-error', () => {
    store.dispatch(
      addNotification({
        notification: {
          id: 'storage-write-error',
          type: 'error',
          title: 'Unable to save changes',
          sticky: true,
          message:
            "Your latest changes could not be saved to this browser's " +
            'storage, which may be full. Changes made from now on may be ' +
            'lost when this tab closes. Free up space or export your budget.',
        },
      }),
    );
  });

  // Snapshot the open budget while the tab is hidden or going away. Edits
  // are already durable in the outbox; this keeps it short.
  const flushStorage = () => {
    if (document.visibilityState === 'hidden') {
      void send('app-hidden');
    }
  };
  document.addEventListener('visibilitychange', flushStorage);
  window.addEventListener('pagehide', flushStorage);

  const unlistenIndexeddbQuotaError = listen('indexeddb-quota-error', () => {
    alert(
      'We hit a limit on the local storage available. Edits may not be saved. Please get in touch https://actualbudget.org/contact/ so we can help debug this.',
    );
  });

  const unlistenStartLoad = listen('start-load', () => {
    void store.dispatch(closeBudgetUI());
    store.dispatch(setAppState({ loadingText: '' }));
  });

  const unlistenFinishLoad = listen('finish-load', () => {
    store.dispatch(closeModal());
    store.dispatch(setAppState({ loadingText: null }));
    void store.dispatch(loadPrefs());
  });

  const unlistenStartImport = listen('start-import', () => {
    void store.dispatch(closeBudgetUI());
  });

  const unlistenFinishImport = listen('finish-import', () => {
    store.dispatch(closeModal());
    store.dispatch(setAppState({ loadingText: null }));
    void store.dispatch(loadPrefs());
  });

  const unlistenShowBudgets = listen('show-budgets', () => {
    void store.dispatch(closeBudgetUI());
    store.dispatch(setAppState({ loadingText: null }));
  });

  const unlistenApiFetchRedirected = listen('api-fetch-redirected', () => {
    void window.Actual.reload();
  });

  return () => {
    unlistenServerError();
    unlistenOrphanedPayees();
    unlistenSchedulesOffline();
    unlistenSync();
    unlistenUndo();
    unlistenStorageWriteError();
    document.removeEventListener('visibilitychange', flushStorage);
    window.removeEventListener('pagehide', flushStorage);
    unlistenIndexeddbQuotaError();
    unlistenStartLoad();
    unlistenFinishLoad();
    unlistenStartImport();
    unlistenFinishImport();
    unlistenShowBudgets();
    unlistenApiFetchRedirected();
  };
}
