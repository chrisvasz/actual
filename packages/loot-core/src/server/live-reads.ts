import { captureException } from '#platform/exceptions';
import * as connection from '#platform/server/connection';
import { coerceError } from '#platform/server/connection/errors';
import type { QueryState } from '#shared/query';

import { aqlQuery } from './aql';
import { app } from './main-app';

// Synchronous reads for a client that shares the backend's thread (the
// browser app, see `platform/client/live-reads`). A read runs right away
// against the open budget and returns rows built for it, so nothing is
// copied and nothing it returns is shared with backend state.
//
// A client keeps its reads current with `onTablesChanged`, which reports
// the tables each applied change wrote: the same tables the `sync-event`
// `applied` and `success` events carry.

/** The tables a change wrote, or `'all'` when a budget opened or closed. */
export type ChangedTables = readonly string[] | 'all';

export type LiveReads = {
  /**
   * Run an AQL query now. Returns its rows (a single value for a
   * `calculate` query) and the tables it read. Throws the error shape a
   * rejected `send('query')` has.
   */
  query(query: QueryState): { data: unknown; dependencies: string[] };
  /** Call `listener` after each change to the budget's tables. */
  onTablesChanged(listener: (tables: ChangedTables) => void): () => void;
};

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
