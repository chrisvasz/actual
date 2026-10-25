import { useSyncExternalStore } from 'react';

import type { RegisterScope } from '@actual-app/core/shared/register-view';

import { getRegisterRows } from '#transactions/registerStore';
import type { RegisterSnapshot } from '#transactions/registerStore';

/**
 * The rows of `scope`'s register, kept current: its transactions, grouped by
 * split, in the default order. Read on the first render that asks.
 */
export function useRegisterRows(scope: RegisterScope): RegisterSnapshot {
  const handle = getRegisterRows(scope);
  return useSyncExternalStore(handle.subscribe, handle.getSnapshot);
}

/** Read `scope`'s register again, after its read failed. */
export function retryRegisterRows(scope: RegisterScope) {
  getRegisterRows(scope).retry();
}
