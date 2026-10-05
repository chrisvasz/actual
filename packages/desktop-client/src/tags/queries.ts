import { send } from '@actual-app/core/platform/client/connection';
import { handlerReads } from '@actual-app/core/shared/handler-reads';
import type { TagEntity } from '@actual-app/core/types/models';
import { queryOptions } from '@tanstack/react-query';

export const tagQueries = {
  all: () => ['tags'],
  lists: () => [...tagQueries.all(), 'lists'],
  list: () =>
    queryOptions<TagEntity[]>({
      queryKey: [...tagQueries.lists()],
      queryFn: () => send('tags-get'),
      placeholderData: [],
      // Refetched when a sync event changes a table it reads
      staleTime: Infinity,
      meta: { dependencies: handlerReads['tags-get'] },
    }),
};
