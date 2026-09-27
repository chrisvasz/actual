import { useState } from 'react';
import type { ReactNode } from 'react';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';

import { TourContext } from './TourContext';
import type { TourId } from './TourContext';

type TourProviderProps = {
  children: ReactNode;
};

export function TourProvider({ children }: TourProviderProps) {
  const { isNarrowWidth } = useResponsive();
  const [activeTourId, setActiveTourId] = useState<TourId | null>(null);

  const startTour = (tourId: TourId = 'budget-tour') => {
    if (isNarrowWidth) {
      return;
    }
    setActiveTourId(tourId);
  };

  const stopTour = () => {
    setActiveTourId(null);
  };

  return (
    <TourContext.Provider value={{ activeTourId, startTour, stopTour }}>
      {children}
    </TourContext.Provider>
  );
}
