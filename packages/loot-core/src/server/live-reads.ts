import { captureException } from '#platform/exceptions';
import type { BudgetChanges, LiveReads } from '#platform/in-process-channel';
import * as connection from '#platform/server/connection';
import { coerceError } from '#platform/server/connection/errors';

import { aqlQuery } from './aql';
import * as db from './db';

// Synchronous reads for a client that shares the backend's thread (the
// browser app, see `platform/client/live-reads`). A read runs right away
// against the open budget and returns rows built for it, so nothing is
// copied and nothing it returns is shared with backend state.
//
// A client keeps its reads current with `onChanges`. Whatever changes the
// open budget reports it with `notifyChanges`, once the change is
// committed:
// - `applyMessages`, for every write: local edits, undo/redo, synced
//   batches, and what rules and transfers write along with them. A sync's
//   closing `success` event isn't reported: each batch it received was
//   already applied, and reported, by `applyMessages`.
// - Opening and closing a budget report `'all'`. Writes that skip
//   `applyMessages` (replaying pending messages, migrations, rebuilding
//   derived tables) only happen while a budget opens, before that.
//
// With no budget open (a screen re-reading as its budget closes), a read
// has no rows rather than failing; `'all'` marks it out of date when the
// next budget opens.

const listeners = new Set<(changes: BudgetChanges) => void>();

/** Report a committed change to every `onChanges` listener. */
export function notifyChanges(changes: BudgetChanges) {
  for (const listener of [...listeners]) {
    // A listener is UI code; its failure mustn't fail the change that
    // was just applied
    try {
      listener(changes);
    } catch (error) {
      captureException(error as Error);
    }
  }
}

export const liveReads: LiveReads = {
  query(query) {
    if (!db.getDatabase()) {
      return { data: query?.calculation ? null : [], dependencies: [] };
    }
    try {
      if (query?.table == null) {
        throw new Error(
          'query has no table, did you forgot to call `.serialize`?',
        );
      }
      return aqlQuery(query);
    } catch (nativeError) {
      const error = coerceError(nativeError);
      // Reported like a failed `send('query')`
      if (error.type === 'ServerError') {
        captureException(nativeError as Error);
      }
      connection.send('server-error');
      throw error;
    }
  },

  onChanges(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
