import {
  getUnsafeZipMeta,
  isDatabaseSchemaMismatch,
  toMB,
} from '@actual-app/core/shared/errors';
import type { UnsafeZipMeta } from '@actual-app/core/shared/errors';

type ErrorWithMeta = {
  reason: string;
  meta?: unknown;
};

export function getUnsafeZipError({
  zipReason,
  entryName,
  maxSize,
}: UnsafeZipMeta): string {
  const maxSizeMB = toMB(maxSize);
  switch (zipReason) {
    case 'archive-size':
      return `This file is larger than the maximum supported size of ${maxSizeMB} MB, sorry! Visit https://actualbudget.org/contact/ for support.`;
    case 'entry-size':
      return `The file "${entryName}" in this archive is larger than the maximum supported size of ${maxSizeMB} MB, sorry! Visit https://actualbudget.org/contact/ for support.`;
    case 'total-size':
      return `The uncompressed contents of this archive are larger than the maximum supported size of ${maxSizeMB} MB, sorry! Visit https://actualbudget.org/contact/ for support.`;
    case 'unsafe-entry-name':
      return `This archive contains an entry with an unsafe file name: "${entryName}".`;
    case 'duplicate-entry':
      return `This archive contains more than one entry named "${entryName}".`;
    default:
      return 'This file could not be imported, sorry! Visit https://actualbudget.org/contact/ for support.';
  }
}

export function getUploadError({ reason, meta }: ErrorWithMeta) {
  switch (reason) {
    case 'unauthorized':
      return 'You are not logged in.';
    case 'encrypt-failure':
      if (
        meta != null &&
        typeof meta === 'object' &&
        'isMissingKey' in meta &&
        meta.isMissingKey
      ) {
        return 'Encrypting your file failed because you are missing your encryption key. Create your key in the next step.';
      }
      return 'Encrypting the file failed. You have the correct key so this is an internal bug. To fix this, generate a new key in the next step.';
    case 'file-has-reset':
      // Something really weird happened - during reset a sanity
      // check on the server failed. The user just needs to
      // restart the whole process.
      return 'Something went wrong while resetting your file. Please try again.';
    case 'file-has-new-key':
      return 'Unable to encrypt your data because you are missing the key. Create the latest key in the next step.';
    case 'network':
      return 'Uploading the file failed. Check your network connection.';
    default:
      return `An internal error occurred, sorry! Visit https://actualbudget.org/contact/ for support. (ref: ${reason})`;
  }
}

function getSchemaMismatchError() {
  return 'This budget could not be loaded because it uses a newer database schema than this version of Actual supports. Make sure you are using the latest version, then try again.';
}

export function getDownloadError({
  reason,
  meta,
  fileName,
}: {
  reason: string;
  meta?: unknown;
  fileName?: string;
}) {
  if (reason === 'invalid-schema' && isDatabaseSchemaMismatch(meta)) {
    return getSchemaMismatchError();
  }

  switch (reason) {
    case 'network':
    case 'download-failure':
      return 'Downloading the file failed. Check your network connection.';
    case 'not-zip-file':
    case 'invalid-zip-file':
    case 'invalid-meta-file':
      return 'Downloaded file is invalid, sorry! Visit https://actualbudget.org/contact/ for support.';
    case 'zip-too-large': {
      const zipMeta = getUnsafeZipMeta(meta);
      if (zipMeta) {
        return getUnsafeZipError(zipMeta);
      }
      return 'This file is too large to import, sorry! Visit https://actualbudget.org/contact/ for support.';
    }
    case 'decrypt-failure':
      return `Unable to decrypt file ${fileName || '(unknown)'}. To change your key, first download this file with the proper password.`;

    case 'out-of-sync-migrations':
      return 'This budget cannot be loaded with this version of the app. Make sure the app is up-to-date.';

    case 'clock-drift':
      return 'Failed to download the budget because your device time differs too much from the server. Please check your device time settings and ensure they are correct.';

    default: {
      const info =
        meta && typeof meta === 'object' && 'fileId' in meta && meta.fileId
          ? `, fileId: ${String(meta.fileId)}`
          : '';
      return `Something went wrong trying to download that file, sorry! Visit https://actualbudget.org/contact/ for support. reason: ${reason}${info}`;
    }
  }
}

export function getCreateKeyError(error: ErrorWithMeta) {
  return getUploadError(error);
}

export function getTestKeyError({ reason }: ErrorWithMeta) {
  switch (reason) {
    case 'network':
      return 'Unable to connect to the server. We need to access the server to get some information about your keys.';
    case 'old-key-style':
      return 'This file is encrypted with an old unsupported key style. Recreate the key on a device where the file is available, or use an older version of Actual to download it.';
    case 'decrypt-failure':
      return 'Unable to decrypt file with this password. Please try again.';
    default:
      return 'Something went wrong trying to create a key, sorry! Visit https://actualbudget.org/contact/ for support.';
  }
}

export function getSyncError(error: string, id: string) {
  if (error === 'out-of-sync-migrations' || error === 'out-of-sync-data') {
    return 'This budget cannot be loaded with this version of the app.';
  } else if (error === 'budget-not-found') {
    return `Budget "${id}" not found. Check the ID of your budget in the Advanced section of the settings page.`;
  } else if (error === 'clock-drift') {
    return 'Failed to sync because your device time differs too much from the server. Please check your device time settings and ensure they are correct.';
  } else {
    return `We had an unknown problem opening "${id}".`;
  }
}

export function getSecretsError(error: string, reason: string) {
  switch (reason) {
    case 'unauthorized':
      return 'You are not logged in.';
    default:
      return `An error occurred while setting the secret. Please try again. (ref: ${error})`;
  }
}
