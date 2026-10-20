import type { AccountEntity } from '@actual-app/core/types/models';

import { useLiveRead } from './useLiveRead';

const NO_ACCOUNTS: AccountEntity[] = [];

/** Every account, open and closed, in sidebar order. */
export function useAccounts(): AccountEntity[] {
  return useLiveRead('accounts-get').data ?? NO_ACCOUNTS;
}
