/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from 'virtual:pwa-register';

let updateReadyForDownload = false;
let resolveUpdateReadyForDownload: () => void;
const updateReadyForDownloadPromise = new Promise<void>(resolve => {
  resolveUpdateReadyForDownload = resolve;
});

function markUpdateReadyForDownload() {
  updateReadyForDownload = true;
  resolveUpdateReadyForDownload();
}

// Skip SW registration in dev so stale cached assets don't override edits
// between page loads. Plugin code that needs a SW can register one itself.
// In dev there is no SW to install, so applyAppUpdate() can't rely on the
// SW lifecycle to swap the page — fall back to a plain reload so callers
// don't hang on the never-resolving promise inside applyAppUpdate.
const updateSW = import.meta.env.DEV
  ? () => window.location.reload()
  : registerSW({
      immediate: true,
      onNeedRefresh: markUpdateReadyForDownload,
    });

export function isUpdateReadyForDownload() {
  return updateReadyForDownload;
}

/** Resolves only once a new version has been downloaded. */
export function waitForUpdateReadyForDownload() {
  return updateReadyForDownloadPromise;
}

export async function applyAppUpdate() {
  void updateSW();

  // Wait for the service worker swap to reload the page. If the new worker
  // never takes control (e.g. the server is mid-update), force a reload so
  // the "Update now" button doesn't hang forever with no feedback.
  await new Promise(() => {
    setTimeout(() => window.location.reload(), 15000);
  });
}

/**
 * Unregister the service worker handling routing and then reload. This
 * forces the reload to query the actual server rather than delegating to
 * the worker.
 */
export async function reloadBypassingServiceWorker() {
  if (window.navigator.serviceWorker == null) return;

  const registration =
    await window.navigator.serviceWorker.getRegistration('/');
  if (registration == null) return;
  await registration.unregister();
  window.location.reload();
}
