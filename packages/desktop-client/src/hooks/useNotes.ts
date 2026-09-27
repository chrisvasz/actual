import { useCallback, useSyncExternalStore } from 'react';

import { q } from '@actual-app/core/shared/query';
import type { NoteEntity } from '@actual-app/core/types/models';

import { liveQuery } from '#queries/liveQuery';
import type { LiveQuery } from '#queries/liveQuery';

// Every note is loaded through a single shared live query rather than one per
// caller. The budget table renders a notes button for each category and for
// each category/month cell, so a query per button meant hundreds of round
// trips - and hundreds of live subscriptions to re-run on every sync - each
// time the page opened. The notes table only holds a row per annotated entity,
// so fetching all of it once is cheap.
type NotesById = ReadonlyMap<string, string | null>;

const EMPTY_NOTES: NotesById = new Map();

const subscribers = new Set<() => void>();
let live: LiveQuery<NoteEntity> | null = null;
let notesById: NotesById = EMPTY_NOTES;

function subscribeToNotes(onStoreChange: () => void) {
  subscribers.add(onStoreChange);

  if (!live) {
    live = liveQuery<NoteEntity>(q('notes').select('*'), {
      onData: data => {
        notesById = new Map(data.map(note => [note.id, note.note]));
        subscribers.forEach(subscriber => subscriber());
      },
    });
  }

  return () => {
    subscribers.delete(onStoreChange);

    if (subscribers.size === 0) {
      live?.unsubscribe();
      live = null;
      notesById = EMPTY_NOTES;
    }
  };
}

export function useNotes(id: string) {
  const getSnapshot = useCallback(() => notesById.get(id) ?? null, [id]);

  // The snapshot is the note itself, so a component only re-renders when its
  // own note changes - not whenever any note in the budget file does.
  return useSyncExternalStore(subscribeToNotes, getSnapshot);
}
