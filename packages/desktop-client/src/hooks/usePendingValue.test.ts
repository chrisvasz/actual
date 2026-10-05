import { act, renderHook } from '@testing-library/react';

import { usePendingValue } from './usePendingValue';

function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('usePendingValue', () => {
  it('shows the source value when nothing is pending', () => {
    const { result } = renderHook(() => usePendingValue('Groceries'));

    expect(result.current.value).toBe('Groceries');
  });

  it('shows the pending value until the save resolves', async () => {
    const save = deferred();
    const { result } = renderHook(() => usePendingValue('Groceries'));

    act(() => result.current.showUntil('Food', save.promise));
    expect(result.current.value).toBe('Food');

    await act(async () => save.resolve());
    expect(result.current.value).toBe('Groceries');
  });

  it('drops the pending value when the save fails', async () => {
    const save = deferred();
    const { result } = renderHook(() => usePendingValue('Groceries'));

    act(() => result.current.showUntil('Food', save.promise));
    await act(async () => save.reject(new Error('nope')));

    expect(result.current.value).toBe('Groceries');
  });

  it('ignores an older save settling after a newer value is shown', async () => {
    const first = deferred();
    const second = deferred();
    const { result } = renderHook(() => usePendingValue('Groceries'));

    act(() => result.current.showUntil('Food', first.promise));
    act(() => result.current.showUntil('Produce', second.promise));
    await act(async () => first.resolve());

    expect(result.current.value).toBe('Produce');
  });

  it('drops the pending value on reset', () => {
    const { result } = renderHook(() => usePendingValue('Groceries'));

    act(() => {
      result.current.show('Food');
    });
    act(() => result.current.reset());

    expect(result.current.value).toBe('Groceries');
  });
});
