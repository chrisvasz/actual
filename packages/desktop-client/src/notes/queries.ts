import { q } from '@actual-app/core/shared/query';
import type { NoteEntity } from '@actual-app/core/types/models';
import { queryOptions } from '@tanstack/react-query';

import { aqlQuery } from '#queries/aqlQuery';

type NotesById = ReadonlyMap<NoteEntity['id'], NoteEntity['note']>;

export const noteQueries = {
  all: () => ['notes'],
  lists: () => [...noteQueries.all(), 'lists'],
  // Every note is loaded in one query rather than one per caller. The budget
  // table renders a notes button for each category and each category/month
  // cell, so a query per button meant hundreds of round trips each time the
  // page opened. The notes table only holds a row per annotated entity, so
  // fetching all of it is cheap.
  list: () =>
    queryOptions<NotesById>({
      queryKey: [...noteQueries.lists()],
      queryFn: async () => {
        const { data }: { data: NoteEntity[] } = await aqlQuery(
          q('notes').select('*'),
        );
        return new Map(data.map(note => [note.id, note.note]));
      },
      placeholderData: new Map(),
      // Manually invalidated when notes change via sync events
      staleTime: Infinity,
    }),
};
