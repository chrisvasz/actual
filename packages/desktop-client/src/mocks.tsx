import React from 'react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';

import { configureAppStore } from './redux/store';
import type { AppStore } from './redux/store';

let testStore = createTestAppStore();

export function resetTestProviders() {
  testStore = createTestAppStore();
}

export function createTestAppStore() {
  return configureAppStore();
}

export function TestProviders({
  children,
  store,
}: {
  store?: AppStore;
  children: ReactNode;
}) {
  return <Provider store={store ?? testStore}>{children}</Provider>;
}
