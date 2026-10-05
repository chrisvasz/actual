import { send } from '@actual-app/core/platform/client/connection';
import { handlerReads } from '@actual-app/core/shared/handler-reads';
import type { AccountGroupEntity } from '@actual-app/core/types/models';
import { queryOptions } from '@tanstack/react-query';

export const accountGroupQueries = {
  all: () => ['account-groups'],
  lists: () => [...accountGroupQueries.all(), 'lists'],
  list: () =>
    queryOptions<AccountGroupEntity[]>({
      queryKey: [...accountGroupQueries.lists()],
      queryFn: () => send('account-groups-get'),
      placeholderData: [],
      // Refetched when a sync event changes a table it reads
      staleTime: Infinity,
      meta: { dependencies: handlerReads['account-groups-get'] },
    }),
};
