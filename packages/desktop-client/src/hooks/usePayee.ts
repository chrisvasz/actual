import { usePayees } from './usePayees';

export function usePayee(id?: string | null) {
  const payees = usePayees();
  return id ? payees.find(payee => payee.id === id) : undefined;
}
