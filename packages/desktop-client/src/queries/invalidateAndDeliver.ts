import { notifyManager } from '@tanstack/react-query';
import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Invalidates `queryKey` and resolves once the refetched data has reached
 * components, not just the cache. React Query hands cache updates to
 * components on a later tick, so awaiting `invalidateQueries` alone can
 * resolve while they still render the old data. Scheduling through the
 * notify manager queues behind that delivery.
 *
 * Use it in a mutation's `onSuccess` when a component shows a pending value
 * until the mutation settles (see `usePendingValue`).
 */
export async function invalidateAndDeliver(
  queryClient: QueryClient,
  queryKey: QueryKey,
) {
  await queryClient.invalidateQueries({ queryKey });
  await new Promise<void>(resolve => notifyManager.schedule(resolve));
}
