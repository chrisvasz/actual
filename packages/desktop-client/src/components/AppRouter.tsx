import type { ReactNode } from 'react';
import {
  UNSAFE_createBrowserHistory as createBrowserHistory,
  unstable_HistoryRouter as HistoryRouter,
} from 'react-router';

const browserHistory = createBrowserHistory({ v5Compat: true });

// The router applies location changes in a transition, so a screen that
// suspends on its data keeps the previous one up until it's ready. React
// renders a transition scheduled during a `popstate` event synchronously
// instead (so the browser can restore scroll), which would show the Suspense
// fallback on back/forward. Hand those updates over after the event. A
// microtask isn't enough: microtasks run while `window.event` is still set.
const history = new Proxy(browserHistory, {
  get(target, prop, receiver) {
    if (prop === 'listen') {
      return (listener: Parameters<typeof target.listen>[0]) =>
        target.listen(update => {
          if (window.event?.type === 'popstate') {
            setTimeout(() => listener(update), 0);
          } else {
            listener(update);
          }
        });
    }
    return Reflect.get(target, prop, receiver);
  },
});

/** `BrowserRouter`, except back/forward navigations run as transitions too. */
export function AppRouter({ children }: { children: ReactNode }) {
  return <HistoryRouter history={history}>{children}</HistoryRouter>;
}
