import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';

import { resetTestProviders } from './mocks';

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

// jsdom has no layout, so every element measures 0x0 and the sized content
// would never render. Hand it a fixed size instead.
vi.mock('#components/util/AutoSizer', () => ({
  AutoSizer: ({ renderProp }: AutoSizerProps) =>
    renderProp({ height: 1000, width: 600 }),
}));

global.Date.now = () => 123456789;

global.__resetWorld = () => {
  resetTestProviders();
};

process.on('unhandledRejection', (reason: unknown) => {
  console.error('REJECTION', reason);
});

afterEach(() => {
  global.__resetWorld();
});
