import { createContext, useContext } from 'react';

export type MonthBounds = {
  start: string;
  end: string;
};

type MonthsContextValue = {
  /** The months that are mounted, in order. */
  months: string[];
  /** The mounted months that are scrolled out of view. */
  offscreenMonths: string[];
  /** The first month the table can scroll to. */
  firstMonth: string;
  /** How many months the table can scroll through. */
  totalMonths: number;
  /** How many months fit in view. */
  numMonths: number;
};

export const MonthsContext = createContext<MonthsContextValue | null>(null);

export function useMonths() {
  const context = useContext(MonthsContext);
  if (!context) {
    throw new Error('useMonths must be used within a MonthsContext provider');
  }
  return context;
}
