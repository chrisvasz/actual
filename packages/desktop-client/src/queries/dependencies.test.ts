import { QueryClient, QueryObserver } from '@tanstack/react-query';
import type { QueryMeta } from '@tanstack/react-query';

import { invalidateQueriesReading, snapshotDependencies } from './dependencies';

describe('invalidateQueriesReading', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  // Caches a query and returns how many times it has been fetched
  async function cache(key: string, data: unknown, meta?: QueryMeta) {
    const queryFn = vi.fn(() => data);
    await queryClient.fetchQuery({ queryKey: [key], queryFn, meta });
    return () => queryFn.mock.calls.length;
  }

  it('refetches queries whose declared tables changed', async () => {
    const accounts = await cache('accounts', [], {
      dependencies: ['accounts', 'banks'],
    });
    const tags = await cache('tags', [], { dependencies: ['tags'] });
    const undeclared = await cache('undeclared', []);

    await invalidateQueriesReading(queryClient, {
      type: 'applied',
      tables: ['banks'],
    });

    expect(accounts()).toBe(2);
    expect(tags()).toBe(1);
    expect(undeclared()).toBe(1);
  });

  it("reads an AQL snapshot's tables from its data", async () => {
    const notes = await cache(
      'notes',
      { data: [], dependencies: ['notes'] },
      { dependencies: snapshotDependencies },
    );
    const schedules = await cache(
      'schedules',
      { data: [], dependencies: ['schedules', 'rules'] },
      { dependencies: snapshotDependencies },
    );

    await invalidateQueriesReading(queryClient, {
      type: 'success',
      tables: ['rules'],
    });

    expect(notes()).toBe(1);
    expect(schedules()).toBe(2);
  });

  it('restarts a snapshot fetch that has no data yet', async () => {
    // Never settles, so the first fetch is still running when the event comes
    const queryFn = vi.fn(() => new Promise<never>(vi.fn()));
    const observer = new QueryObserver(queryClient, {
      queryKey: ['loading'],
      queryFn,
      meta: { dependencies: snapshotDependencies },
    });
    const unsubscribe = observer.subscribe(vi.fn());

    expect(queryFn).toHaveBeenCalledTimes(1);

    void invalidateQueriesReading(queryClient, {
      type: 'applied',
      tables: ['anything'],
    });

    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
    unsubscribe();
  });

  it('ignores events that list no tables', async () => {
    const queryFn = vi.fn(() => new Promise<never>(vi.fn()));
    const observer = new QueryObserver(queryClient, {
      queryKey: ['loading'],
      queryFn,
      meta: { dependencies: snapshotDependencies },
    });
    const unsubscribe = observer.subscribe(vi.fn());
    const accounts = await cache('accounts', [], {
      dependencies: ['accounts'],
    });

    // Every full sync reports what it received, often nothing
    await invalidateQueriesReading(queryClient, {
      type: 'success',
      tables: [],
    });

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult().fetchStatus).toBe('fetching');
    expect(accounts()).toBe(1);
    unsubscribe();
  });

  it('skips applied events for queries that ignore them', async () => {
    const rows = await cache(
      'rows',
      { data: [], dependencies: ['transactions'] },
      { dependencies: snapshotDependencies, ignoreAppliedEvents: true },
    );

    await invalidateQueriesReading(queryClient, {
      type: 'applied',
      tables: ['transactions'],
    });
    expect(rows()).toBe(1);

    await invalidateQueriesReading(queryClient, {
      type: 'success',
      tables: ['transactions'],
    });
    expect(rows()).toBe(2);
  });
});
