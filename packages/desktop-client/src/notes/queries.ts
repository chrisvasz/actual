import { q } from '@actual-app/core/shared/query';
import type { NoteEntity } from '@actual-app/core/types/models';
import { queryOptions } from '@tanstack/react-query';

import { aqlQuery } from '#queries/aqlQuery';
import { snapshotDependencies } from '#queries/dependencies';
import type { AqlSnapshot } from '#queries/dependencies';

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
    queryOptions<AqlSnapshot<NotesById>, Error, NotesById>({
      queryKey: [...noteQueries.lists()],
      queryFn: async () => {
        const {
          data,
          dependencies,
        }: { data: NoteEntity[]; dependencies: string[] } = await aqlQuery(
          q('notes').select('*'),
        );
        return {
          data: new Map(data.map(note => [note.id, note.note])),
          dependencies,
        };
      },
      select: ({ data }) => data,
      placeholderData: { data: new Map(), dependencies: [] },
      staleTime: Infinity,
      meta: { dependencies: snapshotDependencies },
    }),
};
