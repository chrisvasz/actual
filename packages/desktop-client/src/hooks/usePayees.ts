import type { PayeeEntity } from '@actual-app/core/types/models';

import { getPayeesById } from '#payees';

import { useLiveRead } from './useLiveRead';

const NO_PAYEES: PayeeEntity[] = [];

/** Every payee, transfer payees (named for their account) last. */
export function usePayees(): PayeeEntity[] {
  return useLiveRead('payees-get').data ?? NO_PAYEES;
}

export function usePayeesById() {
  return getPayeesById(usePayees());
}
