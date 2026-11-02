import type { PayeeEntity } from '@actual-app/core/types/models';

import { useLiveRead, useLiveReadRowsById } from './useLiveRead';

const NO_PAYEES: PayeeEntity[] = [];

/** Every payee, transfer payees (named for their account) last. */
export function usePayees(): PayeeEntity[] {
  return useLiveRead('payees-get').data ?? NO_PAYEES;
}

/** Every payee by id. */
export function usePayeesById(): ReadonlyMap<string, PayeeEntity> {
  return useLiveReadRowsById('payees-get');
}
