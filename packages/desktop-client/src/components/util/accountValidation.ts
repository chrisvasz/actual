import type { AccountEntity } from '@actual-app/core/types/models';

export function validateAccountName(
  newAccountName: string,
  accountId: string,
  accounts: AccountEntity[],
): string {
  newAccountName = newAccountName.trim();
  if (newAccountName.length) {
    const duplicateNamedAccounts = accounts.filter(
      account => account.name === newAccountName && account.id !== accountId,
    );
    if (duplicateNamedAccounts.length) {
      return `Name ${newAccountName} already exists.`;
    } else {
      return '';
    }
  } else {
    return 'Name cannot be blank.';
  }
}
