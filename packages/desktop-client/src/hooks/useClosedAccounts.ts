import { useAccounts } from './useAccounts';

export function useClosedAccounts() {
  const accounts = useAccounts();
  return accounts.filter(account => !!account.closed);
}
