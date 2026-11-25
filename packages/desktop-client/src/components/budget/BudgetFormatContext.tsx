import React, { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import { useFormat } from '#hooks/useFormat';

const BudgetFormatContext = createContext<ReturnType<typeof useFormat> | null>(
  null,
);

/**
 * Formatting reads several prefs, so the budget table reads them once here
 * rather than in every cell.
 */
export function BudgetFormatProvider({ children }: { children: ReactNode }) {
  const format = useFormat();
  return (
    <BudgetFormatContext.Provider value={format}>
      {children}
    </BudgetFormatContext.Provider>
  );
}

export function useBudgetFormat() {
  const format = useContext(BudgetFormatContext);
  if (!format) {
    throw new Error(
      'useBudgetFormat must be used within a BudgetFormatProvider',
    );
  }
  return format;
}
