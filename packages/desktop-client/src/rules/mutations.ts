import { send } from '@actual-app/core/platform/client/connection';
import type { RuleEntity } from '@actual-app/core/types/models';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { ruleQueries } from './queries';

function invalidateQueries(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ruleQueries.lists() });
}

type DeleteRulePayload = {
  id: RuleEntity['id'];
};

export function useDeleteRuleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: DeleteRulePayload) => send('rule-delete', id),
    onSuccess: () => invalidateQueries(queryClient),
  });
}

type DeleteAllRulesPayload = {
  ids: Array<RuleEntity['id']>;
};

export function useDeleteAllRulesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ids }: DeleteAllRulesPayload) =>
      send('rule-delete-all', ids),
    onSuccess: () => invalidateQueries(queryClient),
  });
}

export function useInvalidateRules() {
  const queryClient = useQueryClient();
  return () => invalidateQueries(queryClient);
}
