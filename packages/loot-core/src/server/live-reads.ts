import { captureException } from '#platform/exceptions';
import type { ChangedTables, LiveReads } from '#platform/in-process-channel';
import * as connection from '#platform/server/connection';
import { coerceError } from '#platform/server/connection/errors';

import { aqlQuery } from './aql';
import * as db from './db';
import { app } from './main-app';

// Synchronous reads for a client that shares the backend's thread (the
// browser app, see `platform/client/live-reads`). A read runs right away
// against the open budget and returns rows built for it, so nothing is
// copied and nothing it returns is shared with backend state.
//
// A client keeps its reads current with `onTablesChanged`, which reports
// the tables each applied change wrote: the same tables the `sync-event`
// `applied` and `success` events carry.
//
// With no budget open (a screen re-reading as its budget closes), a read
// has no rows rather than failing; `'all'` marks it out of date when the
// next budget opens.

const listeners = new Set<(tables: ChangedTables) => void>();

/** Report changed tables to every `onTablesChanged` listener. */
export function notifyTablesChanged(tables: ChangedTables) {
  for (const listener of [...listeners]) {
    // A listener is UI code; its failure mustn't fail the change that
    // was just applied
    try {
      listener(tables);
    } catch (error) {
      captureException(error as Error);
    }
  }
}

app.events.on('sync', event => {
  if (event.type === 'applied' || event.type === 'success') {
    notifyTablesChanged(event.tables);
  }
});

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

  onTablesChanged(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
