import { useSyncExternalStore } from 'react';

import { memoizeOne } from '@actual-app/core/shared/memoize';
import { q } from '@actual-app/core/shared/query';
import type { NoteEntity } from '@actual-app/core/types/models';

import { getLiveQuery } from '#queries/liveStore';

// Every note is read in one query rather than one per caller. The budget
// table renders a notes button for each category and each category/month
// cell, and the notes table only holds a row per annotated entity, so
// reading all of it is cheap.
const allNotes = getLiveQuery<readonly NoteEntity[]>(q('notes').select('*'));

const getNotesById = memoizeOne(
  (notes: readonly NoteEntity[] | undefined) =>
    new Map((notes ?? []).map(note => [note.id, note.note])),
);

export function useNotes(id: string): string | null {
  // Selecting the one note means a component only re-renders when its own
  // note changes - not whenever any note in the budget file does.
  return useSyncExternalStore(
    allNotes.subscribe,
    () => getNotesById(allNotes.getSnapshot().data).get(id) ?? null,
  );
}
