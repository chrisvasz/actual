import * as connection from '@actual-app/core/platform/client/connection';
import { q } from '@actual-app/core/shared/query';
import type { TransactionEntity } from '@actual-app/core/types/models';
import { QueryObserver } from '@tanstack/react-query';

import { createTestQueryClient } from '#mocks';

import {
  hasMoreTransactions,
  loadMoreTransactions,
  transactionQueries,
} from './queries';
import type { TransactionsSnapshot } from './queries';

const query = q('transactions').select('*');
const rows = Array.from(
  { length: 10 },
  (_, i) => ({ id: `t${i}` }) as TransactionEntity,
);

type Sent = { limit: number | null; offset: number | null };

let serverRows: TransactionEntity[];
let sent: Sent[];
// When set, requests of that kind wait for it before answering
let pageGate: Promise<void> | null;
let snapshotGate: Promise<void> | null;

function mockServer() {
  serverRows = rows;
  sent = [];
  pageGate = null;
  snapshotGate = null;
  vi.spyOn(connection, 'send').mockImplementation((async (
    name: string,
    args: Sent,
  ) => {
    if (name !== 'query') {
      throw new Error(`Unexpected ${name}`);
    }
    sent.push({ limit: args.limit, offset: args.offset });
    const gate = args.offset != null ? pageGate : snapshotGate;
    if (gate) {
      await gate;
    }
    const start = args.offset ?? 0;
    return {
      data: serverRows.slice(start, start + (args.limit ?? serverRows.length)),
      dependencies: ['transactions'],
    };
  }) as unknown as typeof connection.send);
}

function makeGate() {
  let open: (() => void) | undefined;
  const promise = new Promise<void>(resolve => {
    open = resolve;
  });
  return { promise, open: () => open?.() };
}

async function loadFirstPage(limit: number, scope?: string) {
  const queryClient = createTestQueryClient();
  const observer = new QueryObserver(
    queryClient,
    transactionQueries.aql({ query, limit, scope }),
  );
  const unsubscribe = observer.subscribe(vi.fn());
  await vi.waitFor(() =>
    expect(observer.getCurrentResult().data).toBeDefined(),
  );
  sent = [];
  return { queryClient, observer, unsubscribe };
}

function shownIds(observer: QueryObserver<TransactionsSnapshot>) {
  return observer.getCurrentResult().data?.data.map(t => t.id);
}

describe('transactionQueries.aql', () => {
  beforeEach(mockServer);
  afterEach(() => vi.restoreAllMocks());

  it('refetches every loaded row in one query', async () => {
    const { observer, unsubscribe } = await loadFirstPage(4);
    observer.setOptions(transactionQueries.aql({ query, limit: 8 }));
    await vi.waitFor(() => expect(shownIds(observer)).toHaveLength(8));

    sent = [];
    await observer.refetch();

    expect(sent).toEqual([{ limit: 8, offset: null }]);
    unsubscribe();
  });

  it('reports more rows only when the limit was filled', () => {
    const snapshot = { data: rows.slice(0, 4), dependencies: [] };
    expect(hasMoreTransactions(snapshot, 4)).toBe(true);
    expect(hasMoreTransactions(snapshot, 5)).toBe(false);
    expect(hasMoreTransactions(undefined, 4)).toBe(false);
  });
});

describe('loadMoreTransactions', () => {
  beforeEach(mockServer);
  afterEach(() => vi.restoreAllMocks());

  it('fetches only the next page when nothing changed', async () => {
    const { queryClient, observer, unsubscribe } = await loadFirstPage(4);

    const next = await loadMoreTransactions(queryClient, {
      query,
      limit: 4,
      pageSize: 4,
    });
    observer.setOptions(transactionQueries.aql(next));

    expect(sent).toEqual([{ limit: 4, offset: 4 }]);
    expect(shownIds(observer)).toEqual(rows.slice(0, 8).map(t => t.id));
    unsubscribe();
  });

  it('stitches the next page onto a scoped snapshot', async () => {
    const { queryClient, observer, unsubscribe } = await loadFirstPage(
      4,
      'screen',
    );

    const next = await loadMoreTransactions(queryClient, {
      query,
      limit: 4,
      pageSize: 4,
      scope: 'screen',
    });
    observer.setOptions(transactionQueries.aql(next));

    expect(sent).toEqual([{ limit: 4, offset: 4 }]);
    expect(shownIds(observer)).toEqual(rows.slice(0, 8).map(t => t.id));
    expect(
      queryClient.getQueryData(
        transactionQueries.aql({ query, limit: 8 }).queryKey,
      ),
    ).toBeUndefined();
    unsubscribe();
  });

  it('reads the larger snapshot whole if the rows were refetched meanwhile', async () => {
    const { queryClient, observer, unsubscribe } = await loadFirstPage(4);

    const page = makeGate();
    pageGate = page.promise;
    const pending = loadMoreTransactions(queryClient, {
      query,
      limit: 4,
      pageSize: 4,
    });
    serverRows = [{ id: 'new' } as TransactionEntity, ...rows];
    await observer.refetch();
    page.open();
    const next = await pending;

    sent = [];
    observer.setOptions(transactionQueries.aql(next));
    await vi.waitFor(() =>
      expect(shownIds(observer)).toEqual(serverRows.slice(0, 8).map(t => t.id)),
    );
    expect(sent).toEqual([{ limit: 8, offset: null }]);
    unsubscribe();
  });

  it('reads the larger snapshot whole while a refetch is running', async () => {
    const { queryClient, observer, unsubscribe } = await loadFirstPage(4);

    const snapshot = makeGate();
    snapshotGate = snapshot.promise;
    const refetch = observer.refetch();
    const next = await loadMoreTransactions(queryClient, {
      query,
      limit: 4,
      pageSize: 4,
    });
    observer.setOptions(transactionQueries.aql(next));
    snapshot.open();
    await refetch;

    await vi.waitFor(() => expect(shownIds(observer)).toHaveLength(8));
    expect(sent).toContainEqual({ limit: 8, offset: null });
    unsubscribe();
  });

  it('reads the larger snapshot whole if no rows are cached', async () => {
    const queryClient = createTestQueryClient();

    const next = await loadMoreTransactions(queryClient, {
      query,
      limit: 4,
      pageSize: 4,
    });

    expect(next).toEqual({ query, limit: 8 });
    expect(sent).toEqual([]);
  });
});
