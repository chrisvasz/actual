import { memoizeOne } from '@actual-app/core/shared/memoize';
import { groupById } from '@actual-app/core/shared/util';
import type { AccountEntity, PayeeEntity } from '@actual-app/core/types/models';

import { getAccountsById } from '#accounts/accountsSlice';

export const getActivePayees = memoizeOne(
  (payees: PayeeEntity[], accounts: AccountEntity[]) => {
    const accountsById = getAccountsById(accounts);

    return payees.filter(payee => {
      if (payee.transfer_acct) {
        const account = accountsById[payee.transfer_acct];
        return account != null && !account.closed;
      }
      return true;
    });
  },
);

export const getPayeesById = memoizeOne(
  (payees: PayeeEntity[] | null | undefined) => groupById(payees || []),
);
