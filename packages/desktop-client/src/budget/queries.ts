import { send } from '@actual-app/core/platform/client/connection';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';
import { queryOptions } from '@tanstack/react-query';

type CategoryViews = {
  grouped: CategoryGroupEntity[];
  list: CategoryEntity[];
};

export const categoryQueries = {
  all: () => ['categories'],
  lists: () => [...categoryQueries.all(), 'lists'],
  list: () =>
    queryOptions<CategoryViews>({
      queryKey: [...categoryQueries.lists()],
      queryFn: () => send('get-categories'),
      placeholderData: {
        grouped: [],
        list: [],
      },
      // Manually invalidated when categories change
      staleTime: Infinity,
    }),
};
