import type { AccountGroupEntity } from '@actual-app/core/types/models';

import { useLiveRead } from './useLiveRead';

const NO_GROUPS: AccountGroupEntity[] = [];

export function useAccountGroups(): AccountGroupEntity[] {
  return useLiveRead('account-groups-get').data ?? NO_GROUPS;
}
