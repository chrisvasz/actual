import { useAccounts } from './useAccounts';

export function useAccount(id: string) {
  return useAccounts().find(account => account.id === id);
}
