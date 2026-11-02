import type { AccountEntity, PayeeEntity } from '@actual-app/core/types/models';

/** `payees` without the transfer payees of closed or deleted accounts. */
export function getActivePayees<T extends PayeeEntity>(
  payees: T[],
  accounts: AccountEntity[],
): T[] {
  const openAccountIds = new Set(
    accounts.filter(account => !account.closed).map(account => account.id),
  );
  return payees.filter(
    payee => !payee.transfer_acct || openAccountIds.has(payee.transfer_acct),
  );
}
