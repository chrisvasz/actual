import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';

import { resetTestProviders } from './mocks';
import { clearLiveReads } from './mocks/live-reads';
import { resetLiveStoreForTests } from './queries/liveStore';

global.IS_TESTING = true;
global.Actual = {} as typeof global.Actual;

// jsdom doesn't implement ResizeObserver. Components that only use it to
// react to layout changes (rather than asserting on it) can run against a
// no-op stub.
global.ResizeObserver = class {
  observe() {
    // no-op
  }
  unobserve() {
    // no-op
  }
  disconnect() {
    // no-op
  }
};

type Size = { height: number; width: number };

type AutoSizerProps = {
  renderProp: (size: Size) => ReactNode;
};

// There's no backend to read from; tests answer live queries themselves
vi.mock(
  '@actual-app/core/platform/client/live-reads',
  () => import('#mocks/live-reads'),
);

// jsdom has no layout, so every element measures 0x0 and the sized content
// would never render. Hand it a fixed size instead.
vi.mock('#components/util/AutoSizer', () => ({
  AutoSizer: ({ renderProp }: AutoSizerProps) =>
    renderProp({ height: 1000, width: 600 }),
}));

global.Date.now = () => 123456789;

global.__resetWorld = () => {
  resetTestProviders();
  resetLiveStoreForTests();
  clearLiveReads();
};

process.on('unhandledRejection', (reason: unknown) => {
  console.error('REJECTION', reason);
});

afterEach(() => {
  global.__resetWorld();
});
