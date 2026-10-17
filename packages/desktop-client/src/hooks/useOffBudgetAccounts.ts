import { useAccounts } from './useAccounts';

export function useOffBudgetAccounts() {
  const accounts = useAccounts();
  return accounts.filter(account => !account.closed && !!account.offbudget);
}
