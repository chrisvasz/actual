import { act, renderHook, waitFor } from '@testing-library/react';

import { useSelected } from './useSelected';

vi.mock(
  '@actual-app/core/platform/client/connection',
  () => import('#mocks/connection'),
);

type TestItem = { id: string };

function renderUseSelected(initialItems: TestItem[]) {
  return renderHook(
    ({ items }: { items: TestItem[] }) => useSelected('test', items, []),
    { initialProps: { items: initialItems } },
  );
}

describe('useSelected', () => {
  it('selects and deselects a single item', () => {
    const { result } = renderUseSelected([{ id: 'one' }, { id: 'two' }]);

    act(() => result.current.dispatch({ type: 'select', id: 'one' }));
    expect(result.current.items).toEqual(new Set(['one']));

    act(() => result.current.dispatch({ type: 'select', id: 'one' }));
    expect(result.current.items).toEqual(new Set());
  });

  it('range selection covers only the items passed to the hook', () => {
    // The account register passes only the visible transactions as
    // `items` (e.g. hidden reconciled transactions are excluded).
    // Range selection operates on indexes of `items`, so it must
    // select exactly the visible transactions in the range.
    const visibleItems = [{ id: 'one' }, { id: 'three' }, { id: 'five' }];
    const { result } = renderUseSelected(visibleItems);

    act(() => result.current.dispatch({ type: 'select', id: 'one' }));
    act(() =>
      result.current.dispatch({
        type: 'select',
        id: 'five',
        isRangeSelect: true,
      }),
    );

    expect(result.current.items).toEqual(new Set(['one', 'three', 'five']));
  });

  it('removes selected ids that are no longer in items', () => {
    // Simulates hiding transactions (e.g. toggling “hide reconciled
    // transactions”) while they are selected: the selection must be
    // pruned to the items that are still visible.
    const allItems = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
    const { result, rerender } = renderUseSelected(allItems);

    act(() => result.current.dispatch({ type: 'select', id: 'one' }));
    act(() =>
      result.current.dispatch({
        type: 'select',
        id: 'three',
        isRangeSelect: true,
      }),
    );
    expect(result.current.items).toEqual(new Set(['one', 'two', 'three']));

    rerender({ items: [{ id: 'one' }, { id: 'three' }] });

    expect(result.current.items).toEqual(new Set(['one', 'three']));
  });

  it('select-all keeps ids that are not loaded yet', () => {
    // A paged list only loads some items, but select-all is given every id
    const { result } = renderUseSelected([{ id: 'one' }]);

    act(() =>
      result.current.dispatch({ type: 'select-all', ids: ['one', 'two'] }),
    );

    expect(result.current.items).toEqual(new Set(['one', 'two']));
  });

  it('prunes against every id when items are only partially loaded', async () => {
    let allIds = ['one', 'two', 'three', 'four'];
    const fetchAllIds = async () => allIds;
    const { result, rerender } = renderHook(
      ({ items }: { items: TestItem[] }) =>
        useSelected('test', items, [], fetchAllIds),
      { initialProps: { items: [{ id: 'one' }, { id: 'two' }] } },
    );

    act(() => result.current.dispatch({ type: 'select-all', ids: allIds }));

    // Loading another page keeps the selection of not-loaded items
    rerender({ items: [{ id: 'one' }, { id: 'two' }, { id: 'three' }] });
    await act(() => fetchAllIds());
    expect(result.current.items).toEqual(
      new Set(['one', 'two', 'three', 'four']),
    );

    // Deleting a loaded and a not-loaded item removes both from the
    // selection
    allIds = ['one', 'three'];
    rerender({ items: [{ id: 'one' }, { id: 'three' }] });
    await waitFor(() =>
      expect(result.current.items).toEqual(new Set(['one', 'three'])),
    );
  });
});
