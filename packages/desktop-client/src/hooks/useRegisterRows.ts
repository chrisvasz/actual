import { useSyncExternalStore } from 'react';

import {
  getRegisterSnapshot,
  subscribeToRegisterRows,
} from '#transactions/registerStore';
import type { RegisterSnapshot } from '#transactions/registerStore';

/**
 * Every account register's rows, kept current: the open budget's
 * transactions, grouped by split, in the default order.
 */
export function useRegisterRows(): RegisterSnapshot {
  return useSyncExternalStore(subscribeToRegisterRows, getRegisterSnapshot);
}
