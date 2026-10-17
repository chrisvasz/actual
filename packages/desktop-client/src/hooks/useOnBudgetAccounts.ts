import { useAccounts } from './useAccounts';

export function useOnBudgetAccounts() {
  const accounts = useAccounts();
  return accounts.filter(account => !account.closed && !account.offbudget);
}
