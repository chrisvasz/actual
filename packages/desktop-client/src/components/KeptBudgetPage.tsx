import { Activity, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useLocation } from 'react-router';

import { StableNavigateProvider } from '#hooks/useStableNavigate';

import { FeatureErrorFallback } from './FeatureErrorFallback';
import { WideComponent } from './responsive';

/**
 * The budget page, kept mounted but hidden once it has been opened. Switching
 * back to it then only has to show it again, instead of rebuilding a table of
 * several hundred bound cells. While hidden, React tears its effects down as
 * if it had unmounted, so it holds no cell subscriptions, listeners or hotkeys.
 */
export function KeptBudgetPage() {
  const location = useLocation();
  const isBudgetPage = location.pathname === '/budget';
  const [hasOpened, setHasOpened] = useState(isBudgetPage);
  if (isBudgetPage && !hasOpened) {
    setHasOpened(true);
  }

  if (!hasOpened) {
    return null;
  }

  // The budget page gets a navigate function that doesn't change on
  // navigation, so navigating elsewhere doesn't re-render its table.
  return (
    <StableNavigateProvider>
      <Activity mode={isBudgetPage ? 'visible' : 'hidden'}>
        <ErrorBoundary
          FallbackComponent={FeatureErrorFallback}
          resetKeys={[location.pathname]}
        >
          <WideComponent name="Budget" />
        </ErrorBoundary>
      </Activity>
    </StableNavigateProvider>
  );
}
