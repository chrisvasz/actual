import type { Query } from '@actual-app/core/shared/query';
import type { TransactionEntity } from '@actual-app/core/types/models';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { aqlQuery } from '#queries/aqlQuery';
import { snapshotDependencies } from '#queries/dependencies';
import type { AqlSnapshot } from '#queries/dependencies';

/** Rows read by a transactions query, and the tables they were read from. */
export type TransactionsSnapshot = AqlSnapshot<TransactionEntity[]>;

type TransactionsQueryArgs = {
  query?: Query;
  limit: number;
  initialData?: () => TransactionsSnapshot | undefined;
};

export const transactionQueries = {
  all: () => ['transactions'],
  /**
   * The first `limit` rows of `query`, read as one snapshot. Showing more rows
   * raises the limit (see `loadMoreTransactions`), so a refetch re-reads every
   * shown row in one query and can't repeat or drop rows where pages meet.
   *
   * Kept only while something shows it, and fresh until a sync event changes
   * a table it read.
   */
  aql: ({ query, limit, initialData }: TransactionsQueryArgs) =>
    queryOptions<TransactionsSnapshot>({
      queryKey: [...transactionQueries.all(), 'aql', query, limit],
      queryFn: async () => {
        if (!query) {
          // Shouldn't happen because of the enabled flag, but needed to satisfy TS
          throw new Error('No query provided.');
        }
        return aqlQuery(query.limit(limit));
      },
      initialData,
      placeholderData: keepPreviousData,
      staleTime: Infinity,
      gcTime: 0,
      enabled: !!query,
      meta: { dependencies: snapshotDependencies },
    }),
};

/** Whether `query` has rows past the `limit` already read. */
export function hasMoreTransactions(
  snapshot: TransactionsSnapshot | undefined,
  limit: number,
) {
  return snapshot != null && snapshot.data.length >= limit;
}

/**
 * The query args for one more page of `query`'s rows. Only the new page is
 * fetched, and the larger snapshot starts from the rows on screen plus that
 * page. That only holds while nothing has changed since those rows were read:
 * if they've been refetched, or a refetch is running, when the larger
 * snapshot is created, it's read whole instead, so a page is never stitched
 * onto rows that are out of date.
 */
export async function loadMoreTransactions(
  queryClient: QueryClient,
  { query, limit, pageSize }: { query: Query; limit: number; pageSize: number },
): Promise<TransactionsQueryArgs> {
  const nextLimit = limit + pageSize;
  const { queryKey } = transactionQueries.aql({ query, limit });
  const current = queryClient.getQueryData(queryKey);
  if (current == null) {
    return { query, limit: nextLimit };
  }

  const page = await aqlQuery(
    query.limit(pageSize).offset(current.data.length),
  );
  const stitched: TransactionsSnapshot = {
    data: current.data.concat(page.data),
    dependencies: current.dependencies,
  };

  return {
    query,
    limit: nextLimit,
    initialData: () =>
      queryClient.getQueryData(queryKey) === current &&
      queryClient.getQueryState(queryKey)?.fetchStatus === 'idle'
        ? stitched
        : undefined,
  };
}
