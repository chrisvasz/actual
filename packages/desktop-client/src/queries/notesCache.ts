import {
  onChanges,
  runQuerySync,
} from '@actual-app/core/platform/client/live-reads';
import { getNormalisedString } from '@actual-app/core/shared/normalisation';
import { q } from '@actual-app/core/shared/query';
import type { Query } from '@actual-app/core/shared/query';
import type { TransactionEntity } from '@actual-app/core/types/models';

/** A register's notes, normalised for search, by transaction id. */
export type NotesCache = ReadonlyMap<TransactionEntity['id'], string>;

/**
 * The notes of every transaction `query` can show, split children
 * included, since a search matches their notes too.
 */
function notesCacheQuery(query: Query) {
  return query
    .serialize()
    .filterExpressions.reduce(
      (notesQuery, filter) => notesQuery.filter(filter),
      q('transactions'),
    )
    .options({ splits: 'all' })
    .filter({ notes: { $ne: null } })
    .select(['id', 'notes']);
}

/**
 * Normalised notes for a register's search, so notes match by the same
 * rules as names without calling from SQL into JS for every row. The
 * notes are read once per query and kept until a change to a table they
 * were read from, local or synced. Call `stop` when the register closes.
 */
export function createNotesCache() {
  let cached: {
    key: string;
    notes: NotesCache;
    dependencies: readonly string[];
  } | null = null;

  const stop = onChanges(changes => {
    if (
      cached &&
      (changes === 'all' ||
        changes.tables.some(table => cached?.dependencies.includes(table)))
    ) {
      cached = null;
    }
  });

  return {
    /**
     * The notes `query` can show, read now unless they're already kept.
     * Null if they can't be read, for the search to match notes in SQL.
     */
    read(query: Query): NotesCache | null {
      const notesQuery = notesCacheQuery(query);
      const key = notesQuery.serializeAsString();
      if (cached?.key !== key) {
        try {
          const { data, dependencies } =
            runQuerySync<Array<Pick<TransactionEntity, 'id' | 'notes'>>>(
              notesQuery,
            );
          const notes = new Map<string, string>();
          for (const row of data) {
            notes.set(row.id, getNormalisedString(row.notes ?? ''));
          }
          cached = { key, notes, dependencies };
        } catch {
          return null;
        }
      }
      return cached.notes;
    },
    /** Whether `notes` is still the latest read, with no change since. */
    isCurrent(notes: NotesCache) {
      return cached?.notes === notes;
    },
    stop,
  };
}

export type NotesCacheHandle = ReturnType<typeof createNotesCache>;
