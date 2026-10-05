import { useQuery } from '@tanstack/react-query';

import { noteQueries } from '#notes/queries';

export function useNotes(id: string) {
  // Selecting the one note means a component only re-renders when its own
  // note changes - not whenever any note in the budget file does.
  const { data } = useQuery({
    ...noteQueries.list(),
    select: ({ data: notesById }) => notesById.get(id) ?? null,
  });
  return data ?? null;
}
