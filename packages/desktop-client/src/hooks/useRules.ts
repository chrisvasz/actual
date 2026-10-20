import { useMemo, useSyncExternalStore } from 'react';

import type { PayeeEntity, RuleEntity } from '@actual-app/core/types/models';

import { getLiveRead } from '#queries/liveStore';

const NO_RULES: RuleEntity[] = [];

/**
 * Every rule, or only those that refer to `payeeId` when given, in the
 * order they run.
 */
export function useRules(payeeId?: PayeeEntity['id'] | null): RuleEntity[] {
  const handle = useMemo(
    () =>
      payeeId
        ? getLiveRead('payees-get-rules', { id: payeeId })
        : getLiveRead('rules-get'),
    [payeeId],
  );
  return (
    useSyncExternalStore(handle.subscribe, handle.getSnapshot).data ?? NO_RULES
  );
}
