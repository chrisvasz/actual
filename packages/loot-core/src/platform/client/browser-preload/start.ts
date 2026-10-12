import { createInProcessChannel } from '#platform/in-process-channel';
import type { InProcessChannel } from '#platform/in-process-channel';
import { logger } from '#platform/server/log';
import type * as Backend from '#server/main';

export type StartBackendOptions = {
  /** URL of the backend bundle, an ES module exporting `initApp`. */
  backendUrl: string;
  isDev: boolean;
};

/** Rejection when the backend fails to load or start. */
export type BackendInitFailure = Error & {
  type: 'app-init-failure';
  BackendInitFailure?: true;
  IDBFailure?: boolean;
};

function initFailure(
  message: string,
  cause: unknown,
  fields: Omit<BackendInitFailure, keyof Error | 'type'>,
): BackendInitFailure {
  return Object.assign(new Error(message, { cause }), {
    type: 'app-init-failure' as const,
    ...fields,
  });
}

// Only one tab at a time may run the backend. The backend keeps the open
// budget in memory and owns its snapshots and outbox; a second tab would
// load its own copy, and the two would drift apart and overwrite each
// other's snapshots. The tab that gets this lock holds it until the page
// unloads.
const BACKEND_LOCK_NAME = 'actual-backend';

// The dev build of the page can be up before the backend's first build
// finishes, so keep trying for a while
const DEV_IMPORT_RETRIES = 5;
const DEV_IMPORT_RETRY_DELAY_MS = 5000;

/**
 * Loads the backend and starts it on this page's main thread. Resolves to
 * the channel the client connection talks to it over, or to the reason
 * instead, without loading anything, when the page isn't a secure context
 * (no Web Locks, so no way to keep a second tab out) or another tab is
 * already running the backend. Rejects with a `BackendInitFailure`.
 */
export async function startBrowserBackend({
  backendUrl,
  isDev,
}: StartBackendOptions): Promise<
  InProcessChannel | 'insecure-context' | 'already-open'
> {
  if (!window.isSecureContext) {
    return 'insecure-context';
  }
  if (!(await acquireBackendLock())) {
    return 'already-open';
  }

  // Loading and starting the backend blocks the main thread; let the
  // loading screen paint first
  await afterNextPaint();

  let backend: typeof Backend;
  try {
    backend = await importBackend(backendUrl, isDev ? DEV_IMPORT_RETRIES : 0);
  } catch (error) {
    logger.error('Failed loading the backend:', error);
    throw initFailure('Failed loading the backend', error, {
      BackendInitFailure: true,
    });
  }

  const channel = createInProcessChannel();
  try {
    await backend.initApp(isDev, channel);
  } catch (error) {
    logger.error('Failed starting the backend:', error);
    throw initFailure('Failed starting the backend', error, {
      IDBFailure:
        error instanceof Error && error.message.includes('indexeddb-failure'),
    });
  }
  return channel;
}

async function importBackend(
  url: string,
  retries: number,
  attempt = 0,
): Promise<typeof Backend> {
  try {
    // A failed import is cached per URL, so vary it to retry
    return await import(
      /* @vite-ignore */ attempt === 0 ? url : `${url}?retry=${attempt}`
    );
  } catch (error) {
    if (attempt >= retries) {
      throw error;
    }
    logger.warn(
      `Failed to load the backend, will retry ${retries - attempt} more time(s)`,
      error,
    );
    await new Promise(resolve =>
      setTimeout(resolve, DEV_IMPORT_RETRY_DELAY_MS),
    );
    return importBackend(url, retries, attempt + 1);
  }
}

function afterNextPaint(): Promise<void> {
  return new Promise(resolve => {
    // rAF doesn't run in a background tab, so don't wait on it forever
    const fallback = setTimeout(resolve, 100);
    requestAnimationFrame(() => {
      clearTimeout(fallback);
      setTimeout(resolve, 0);
    });
  });
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
