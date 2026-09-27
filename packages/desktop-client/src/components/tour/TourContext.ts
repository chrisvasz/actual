import { createContext, useContext } from 'react';

// Kept separate from TourProvider.tsx so the context object survives HMR:
// a module that mixes components and non-component exports can't be
// hot-swapped by React Refresh, and re-running it would create a new context
// that the mounted provider and its consumers no longer share.

export type TourId = 'budget-tour';

type TourContextValue = {
  activeTourId: TourId | null;
  startTour: (tourId?: TourId) => void;
  stopTour: () => void;
};

export const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return context;
}
