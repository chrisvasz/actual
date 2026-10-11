import type { AccountGroupEntity } from './account-group';

export type AccountEntity = {
  id: string;
  name: string;
  offbudget: 0 | 1;
  closed: 0 | 1;
  sort_order: number;
  last_reconciled: string | null;
  tombstone: 0 | 1;
  account_group_id: AccountGroupEntity['id'] | null;
};
