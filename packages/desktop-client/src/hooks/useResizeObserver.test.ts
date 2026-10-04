import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useResizeObserver } from './useResizeObserver';

type ObserverCallback = (
  entries: Array<{ contentRect: DOMRectReadOnly }>,
) => void;

const originalResizeObserver = global.ResizeObserver;

// Capture the callback the hook hands its observer, so tests can fire it.
function stubResizeObserver() {
  const callbacks: ObserverCallback[] = [];
  global.ResizeObserver = class {
    constructor(callback: ObserverCallback) {
      callbacks.push(callback);
    }
    observe() {
      // no-op
    }
    unobserve() {
      // no-op
    }
    disconnect() {
      // no-op
    }
  } as unknown as typeof ResizeObserver;
  return callbacks;
}

function rect(width: number) {
  return { width, height: 10 } as DOMRectReadOnly;
}

describe('useResizeObserver', () => {
  afterEach(() => {
    global.ResizeObserver = originalResizeObserver;
  });

  it('calls the latest callback, not the one from the first render', () => {
    const callbacks = stubResizeObserver();
    const first = vi.fn();
    const latest = vi.fn();

    const { rerender } = renderHook(({ func }) => useResizeObserver(func), {
      initialProps: { func: first },
    });
    rerender({ func: latest });

    callbacks[0]([{ contentRect: rect(100) }]);

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith(rect(100));
  });

  it('measures on attach when asked', () => {
    stubResizeObserver();
    const func = vi.fn();
    const element = document.createElement('div');
    element.getBoundingClientRect = () => rect(42) as DOMRect;

    const { result } = renderHook(() =>
      useResizeObserver(func, { measureOnAttach: true }),
    );
    result.current(element);

    expect(func).toHaveBeenCalledWith(rect(42));
  });
});
