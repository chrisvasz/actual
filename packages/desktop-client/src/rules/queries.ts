import { send } from '@actual-app/core/platform/client/connection';
import { handlerReads } from '@actual-app/core/shared/handler-reads';
import type { PayeeEntity, RuleEntity } from '@actual-app/core/types/models';
import { queryOptions } from '@tanstack/react-query';

export const ruleQueries = {
  all: () => ['rules'],
  lists: () => [...ruleQueries.all(), 'lists'],
  list: () =>
    queryOptions<RuleEntity[]>({
      queryKey: [...ruleQueries.lists()],
      queryFn: () => send('rules-get'),
      placeholderData: [],
      // Refetched when a sync event changes a table it reads
      staleTime: Infinity,
      meta: { dependencies: handlerReads['rules-get'] },
    }),
  // Keyed under `lists()` so invalidating the list also refreshes the
  // per-payee subsets.
  listForPayee: (payeeId: PayeeEntity['id']) =>
    queryOptions<RuleEntity[]>({
      queryKey: [...ruleQueries.lists(), payeeId],
      queryFn: () => send('payees-get-rules', { id: payeeId }),
      placeholderData: [],
      // Refetched when a sync event changes a table it reads
      staleTime: Infinity,
      meta: { dependencies: handlerReads['payees-get-rules'] },
    }),
};
