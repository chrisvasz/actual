import { initBackend as initSQLBackend } from 'absurd-sql/dist/indexeddb-main-thread';

export type StartBackendInit = {
  version: string;
  isDev: boolean;
  publicUrl?: string;
  hash?: string;
};

export type StartBackendOptions = {
  /** URL of the backend Worker script to spawn. */
  backendWorkerUrl: URL;
  /** Payload posted to the worker as its init msg. */
  initPayload: StartBackendInit;
};

// Only one tab at a time may run the backend. A second tab's backend would
// keep its own in-memory spreadsheet and sync state and drift apart from the
// first one's. The tab that gets this lock holds it until the page unloads.
const BACKEND_LOCK_NAME = 'actual-backend';

/**
 * Starts the backend in a dedicated Worker for this tab. Resolves to `null`
 * without starting anything when another tab is already running the backend.
 */
export async function startBrowserBackend({
  backendWorkerUrl,
  initPayload,
}: StartBackendOptions): Promise<Worker | null> {
  if (!(await acquireBackendLock())) {
    return null;
  }

  const worker = new Worker(backendWorkerUrl);
  initSQLBackend(worker);

  if (window.SharedArrayBuffer) {
    localStorage.removeItem('SharedArrayBufferOverride');
  }

  worker.postMessage({
    type: 'init',
    ...initPayload,
    hasSharedArrayBuffer: !!window.SharedArrayBuffer,
    isSharedArrayBufferOverrideEnabled: localStorage.getItem(
      'SharedArrayBufferOverride',
    ),
  });

  return worker;
}

function acquireBackendLock(): Promise<boolean> {
  // Web Locks need a secure context, so they're missing on plain HTTP (used
  // with the SharedArrayBuffer override). Run without the check there.
  if (!navigator.locks) {
    return Promise.resolve(true);
  }

  return new Promise(resolve => {
    navigator.locks
      .request(BACKEND_LOCK_NAME, { ifAvailable: true }, lock => {
        resolve(lock !== null);
        if (!lock) {
          return;
        }
        return new Promise<never>(() => {
          // Never settle, so the lock is held for the life of the page.
        });
      })
      // The request rejects when the browser blocks storage for this site.
      // Start anyway so the backend reports the real storage error.
      .catch(() => resolve(true));
  });
}
