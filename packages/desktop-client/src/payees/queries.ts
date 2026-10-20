import { memoizeOne } from '@actual-app/core/shared/memoize';
import { groupById } from '@actual-app/core/shared/util';
import type {
  AccountEntity,
  NearbyPayeeEntity,
  PayeeEntity,
} from '@actual-app/core/types/models';
import { queryOptions } from '@tanstack/react-query';

import { getAccountsById } from '#accounts/accountsSlice';

import { locationService } from './location';

// Payee lists are live reads (`usePayees` and friends); only nearby payees,
// which need the device's location, are fetched here
export const payeeQueries = {
  all: () => ['payees'],
  listNearby: () =>
    queryOptions<NearbyPayeeEntity[]>({
      queryKey: [...payeeQueries.all(), 'nearby'],
      queryFn: async () => {
        const position = await locationService.getCurrentPosition();
        return locationService.getNearbyPayees({
          latitude: position.latitude,
          longitude: position.longitude,
        });
      },
      placeholderData: [],
      // Manually invalidated when payee locations change
      staleTime: Infinity,
    }),
};

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
