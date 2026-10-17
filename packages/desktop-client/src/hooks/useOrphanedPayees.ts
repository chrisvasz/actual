import type { PayeeEntity } from '@actual-app/core/types/models';

import { useLiveRead } from './useLiveRead';

const NO_PAYEES: Pick<PayeeEntity, 'id'>[] = [];

/** Payees no transaction or rule uses. */
export function useOrphanedPayees(): Pick<PayeeEntity, 'id'>[] {
  return useLiveRead('payees-get-orphaned').data ?? NO_PAYEES;
}
