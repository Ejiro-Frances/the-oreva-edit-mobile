import type { QueryClient } from '@tanstack/react-query';

export const bagQueryKey = (userId: string | null) => ['bag', userId] as const;
export const bagMutationKey = ['bag-change'] as const;

/**
 * Asks for a fresh copy of the bag (guest or signed in), unless a bag change is on its way:
 * the provider refetches once the last change settles, so a reply now could only be stale.
 */
export function refreshBag(queryClient: QueryClient, userId: string | null) {
  if (queryClient.isMutating({ mutationKey: bagMutationKey }) > 0) return Promise.resolve();
  return queryClient.invalidateQueries({ queryKey: bagQueryKey(userId) });
}
