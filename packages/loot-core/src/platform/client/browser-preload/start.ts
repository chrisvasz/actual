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

// Only one tab at a time may run the backend. The backend keeps the open
// budget in memory and owns its snapshots and outbox; a second tab would
// load its own copy, and the two would drift apart and overwrite each
// other's snapshots. The tab that gets this lock holds it until the page
// unloads.
const BACKEND_LOCK_NAME = 'actual-backend';

/**
 * Starts the backend in a dedicated Worker for this tab. Resolves to the
 * reason instead, without starting anything, when the page isn't a secure
 * context (no Web Locks, so no way to keep a second tab out) or another
 * tab is already running the backend.
 */
export async function startBrowserBackend({
  backendWorkerUrl,
  initPayload,
}: StartBackendOptions): Promise<Worker | 'insecure-context' | 'already-open'> {
  if (!window.isSecureContext) {
    return 'insecure-context';
  }
  if (!(await acquireBackendLock())) {
    return 'already-open';
  }

  const worker = new Worker(backendWorkerUrl);
  worker.postMessage({ type: 'init', ...initPayload });

  return worker;
}

function acquireBackendLock(): Promise<boolean> {
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
