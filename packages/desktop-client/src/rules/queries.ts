import { send } from '@actual-app/core/platform/client/connection';
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
      // Manually invalidated when rules change
      staleTime: Infinity,
    }),
  // Keyed under `lists()` so invalidating the list also refreshes the
  // per-payee subsets.
  listForPayee: (payeeId: PayeeEntity['id']) =>
    queryOptions<RuleEntity[]>({
      queryKey: [...ruleQueries.lists(), payeeId],
      queryFn: () => send('payees-get-rules', { id: payeeId }),
      placeholderData: [],
      // Manually invalidated when rules change
      staleTime: Infinity,
    }),
};
