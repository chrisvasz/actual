import type { PayeeEntity } from '@actual-app/core/types/models';

import { useLiveRead } from './useLiveRead';

/** How many rules use each payee, leaving out completed schedules' rules. */
export function usePayeeRuleCounts(): Map<PayeeEntity['id'], number> {
  const counts = useLiveRead('payees-get-rule-counts').data;
  return new Map(Object.entries(counts ?? {}));
}
