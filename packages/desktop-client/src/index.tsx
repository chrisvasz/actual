// Initializes the app in the browser
// Start the backend and register the service worker before anything else.
import '#platform/backend';
import '#platform/updates';
import './fonts.scss';
import './i18n';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import type { NavigateFunction } from 'react-router';

import { send } from '@actual-app/core/platform/client/connection';
import { q } from '@actual-app/core/shared/query';
import type { Theme } from '@actual-app/core/types/prefs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider } from './auth/AuthProvider';
import { closeBudget } from './budgetfiles/budgetfilesSlice';
import { App } from './components/App';
import { ServerProvider } from './components/ServerContext';
import { saveGlobalPrefs } from './prefs/prefsSlice';
import { aqlQuery } from './queries/aqlQuery';
import { configureAppStore } from './redux/store';
import { redo, undo } from './undo';

const queryClient = new QueryClient();
window.__TANSTACK_QUERY_CLIENT__ = queryClient;

const store = configureAppStore({ queryClient });

function inputFocused(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  return (
    target?.tagName === 'INPUT' ||
    target?.tagName === 'TEXTAREA' ||
    target?.isContentEditable === true
  );
}

// Lets e2e tests switch themes without going through the settings page.
window.__setTheme = (theme: Theme) =>
  void store.dispatch(saveGlobalPrefs({ prefs: { theme } }));

// Expose send for fun!
window.$send = send;
window.$query = aqlQuery;
window.$q = q;

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container not found');
}
const root = createRoot(container);
root.render(
  <QueryClientProvider client={queryClient}>
    <Provider store={store}>
      <ServerProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ServerProvider>
    </Provider>
  </QueryClientProvider>,
);

declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions
  interface Window {
    __navigate?: NavigateFunction;
    __setTheme: (theme: Theme) => void;

    $send: typeof send;
    $query: typeof aqlQuery;
    $q: typeof q;

    __TANSTACK_QUERY_CLIENT__: QueryClient;
  }
}

document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey) {
    // Cmd/Ctrl+o
    if (e.key === 'o') {
      e.preventDefault();
      void store.dispatch(closeBudget());
    }
    // Cmd/Ctrl+z
    else if (e.key.toLowerCase() === 'z') {
      if (inputFocused(e)) {
        return;
      }
      e.preventDefault();
      if (e.shiftKey) {
        // Redo
        redo();
      } else {
        // Undo
        undo();
      }
    }
  }
});

// Touched by PR #74 to trigger E2E for a CI timing run.
