import { startBrowserBackend } from '@actual-app/core/platform/client/browser-preload';

import { ACTUAL_VERSION } from './version';

const backendWorkerUrl = new URL('../browser-server.js', import.meta.url);

// Each tab runs the backend in its own Worker, but only one tab at a time may
// do so. This resolves to null when another tab already has Actual open.
const workerPromise = startBrowserBackend({
  backendWorkerUrl,
  initPayload: {
    version: ACTUAL_VERSION,
    isDev: import.meta.env.DEV,
    publicUrl: import.meta.env.BASE_URL.slice(0, -1),
    hash: import.meta.env.REACT_APP_BACKEND_WORKER_HASH,
  },
});

// Ask the browser to exclude this origin's storage (the local budget database
// in IndexedDB) from automatic eviction under storage pressure. Without this,
// the browser is allowed to silently delete all local data, forcing a full
// re-download of the budget and losing any changes not yet synced.
if (navigator.storage?.persist) {
  void navigator.storage
    .persist()
    .then(persisted => {
      if (!persisted) {
        console.warn(
          'Persistent storage was not granted; the browser may evict local budget data under storage pressure.',
        );
      }
    })
    .catch(error => {
      console.warn('Persistent storage request failed:', error);
    });
}

export async function getServerSocket() {
  const worker = await workerPromise;
  if (!worker) {
    throw Object.assign(new Error('Actual is already open in another tab'), {
      type: 'app-init-failure',
      AlreadyOpenInAnotherTab: true,
    });
  }
  return worker;
}
