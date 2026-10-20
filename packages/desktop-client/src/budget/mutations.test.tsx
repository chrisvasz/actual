import React from 'react';
import type { ReactNode } from 'react';

import { initServer } from '@actual-app/core/platform/client/connection';
import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';
import { act, renderHook } from '@testing-library/react';

import { useCategory } from '#hooks/useCategory';
import { createTestAppStore, TestProviders } from '#mocks';
import { changeTables, initLiveReads } from '#mocks/live-reads';

import {
  useBudgetActions,
  useReorderCategory,
  useSaveCategory,
  useSaveCategoryGroup,
} from './mutations';

vi.mock(
  '@actual-app/core/platform/client/connection',
  () => import('#mocks/connection'),
);

const food: CategoryEntity = {
  id: 'food',
  name: 'Food',
  group: 'usual',
  is_income: false,
};
const rent: CategoryEntity = {
  id: 'rent',
  name: 'Rent',
  group: 'bills',
  is_income: false,
};

describe('category mutations', () => {
  let groups: CategoryGroupEntity[];
  let store: ReturnType<typeof createTestAppStore>;
  let sent: Array<{ name: string; args: unknown }>;

  function wrapper({ children }: { children: ReactNode }) {
    store = createTestAppStore();
    return <TestProviders store={store}>{children}</TestProviders>;
  }

  function notifications() {
    return store.getState().notifications.notifications.map(n => n.message);
  }

  beforeEach(() => {
    groups = [
      { id: 'usual', name: 'Usual', is_income: false, categories: [food] },
      { id: 'bills', name: 'Bills', is_income: false, categories: [rent] },
    ];
    initLiveReads(null, name => {
      if (name !== 'get-categories') {
        throw new Error(`read unknown live read: ${name}`);
      }
      return {
        data: { grouped: groups, list: groups.flatMap(g => g.categories) },
        dependencies: ['categories', 'category_groups'],
      };
    });
    sent = [];
    const record = (name: string) => async (args: unknown) => {
      sent.push({ name, args });
    };
    initServer({
      'category-update': record('category-update'),
      'category-move': record('category-move'),
      'category-group-update': record('category-group-update'),
    });
  });

  it('shows a category renamed by a change', async () => {
    const { result } = renderHook(() => useCategory('food'), { wrapper });
    expect(result.current?.name).toBe('Food');

    groups = [
      { ...groups[0], categories: [{ ...food, name: 'Groceries' }] },
      groups[1],
    ];
    // Listeners are told in a microtask
    await act(async () => changeTables(['categories']));

    expect(result.current?.name).toBe('Groceries');
  });

  it("doesn't save a category named like another in its group", async () => {
    groups[0].categories = [food, { ...rent, id: 'gift', group: 'usual' }];
    const { result } = renderHook(() => useSaveCategory(), { wrapper });

    await act(() => result.current({ category: { ...food, name: 'RENT' } }));

    expect(sent).toEqual([]);
    expect(notifications()).toEqual([
      'Category "RENT" already exists in group (it may be hidden)',
    ]);
  });

  it('saves a rename', async () => {
    const { result } = renderHook(() => useSaveCategory(), { wrapper });

    await act(() =>
      result.current({ category: { ...food, name: 'Groceries' } }),
    );

    expect(sent).toEqual([
      { name: 'category-update', args: { ...food, name: 'Groceries' } },
    ]);
  });

  it("doesn't move a category into a group with one of the same name", async () => {
    groups[1].categories = [rent, { ...food, id: 'food-2', group: 'bills' }];
    const { result } = renderHook(() => useReorderCategory(), { wrapper });

    await act(() =>
      result.current({ id: 'food', groupId: 'bills', targetId: null }),
    );

    expect(sent).toEqual([]);
  });

  it('ignores moving a category that no longer exists', async () => {
    const { result } = renderHook(() => useReorderCategory(), { wrapper });

    await act(() =>
      result.current({ id: 'deleted', groupId: 'bills', targetId: null }),
    );

    expect(sent).toEqual([]);
  });

  it('reports a failed save and resolves', async () => {
    initServer({
      'category-group-update': async () => {
        throw new Error('nope');
      },
    });
    const { result } = renderHook(() => useSaveCategoryGroup(), { wrapper });

    await act(() =>
      result.current({ group: { ...groups[0], name: 'Everyday' } }),
    );

    expect(notifications()).toEqual([
      'There was an error updating the category group. Please try again.',
    ]);
  });
});

describe('budget actions', () => {
  let store: ReturnType<typeof createTestAppStore>;

  function wrapper({ children }: { children: ReactNode }) {
    store = createTestAppStore();
    return <TestProviders store={store}>{children}</TestProviders>;
  }

  it('sends a budgeted amount', async () => {
    const sent: unknown[] = [];
    initServer({
      'budget/budget-amount': async args => {
        sent.push(args);
      },
    });
    const { result } = renderHook(() => useBudgetActions(), { wrapper });

    await act(() =>
      result.current({
        month: '2024-01',
        type: 'budget-amount',
        args: { category: 'food', amount: 100 },
      }),
    );

    expect(sent).toEqual([{ month: '2024-01', category: 'food', amount: 100 }]);
  });

  it('reports a failure and still rejects', async () => {
    initServer({
      'budget/budget-amount': async () => {
        throw new Error('boom');
      },
    });
    const { result } = renderHook(() => useBudgetActions(), { wrapper });

    await act(() =>
      expect(
        result.current({
          month: '2024-01',
          type: 'budget-amount',
          args: { category: 'food', amount: 100 },
        }),
      ).rejects.toThrow('boom'),
    );

    expect(
      store.getState().notifications.notifications.map(({ message, pre }) => ({
        message,
        pre,
      })),
    ).toEqual([
      {
        message:
          'There was an error applying the budget action. Please try again.',
        pre: 'boom',
      },
    ]);
  });
});
