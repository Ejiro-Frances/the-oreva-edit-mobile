import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/features/auth/provider';
import type { BagLine, BagView } from '@/lib/types';
import { applyOptimistic, type BagOp } from './ops';
import { clearLegacyBag, loadLegacyBag } from './legacy';
import { bagMutationKey, bagQueryKey } from './keys';
import { useBagLive } from './live';

export { bagMutationKey, bagQueryKey, refreshBag } from './keys';

type BagContext = {
  lines: BagLine[];
  count: number;
  ready: boolean;
  signedIn: boolean;
  notice: string;
  clearNotice: () => void;
  error: ApiError | null;
  retry: () => void;
  add: (variantId: string, quantity: number) => Promise<boolean>;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
};
const Context = createContext<BagContext | null>(null);

const CAPPED = "Quantity updated to what's in stock";
const FAILED = 'Your bag could not be updated. Please try again.';
const message = (error: unknown) => (error instanceof ApiError && error.code === 'network' ? error.message : FAILED);
const asApiError = (error: Error | null) =>
  !error ? null : error instanceof ApiError ? error : new ApiError(error.message || FAILED, 0);

/**
 * Settles where the bag lives, once per identity (a remount shares the request in flight):
 * signed in, the guest bag and any old on-phone bag move into the account; as a guest, an old
 * on-phone bag is uploaded. The old key is removed only after the server accepted it.
 * Resolves with the bag the server answered with, or null when nothing was sent.
 */
const settles = new Map<string, Promise<BagView | null>>();
function settleBag(userId: string | null) {
  const key = userId ?? 'guest';
  let pending = settles.get(key);
  if (!pending) {
    pending = (async () => {
      const lines = await loadLegacyBag();
      if (!userId && !lines.length) return null;
      const view = await api<BagView>('/api/shopping', {
        method: 'POST',
        auth: !!userId,
        guest: true,
        body: { action: 'merge', lines, wishlist: [] },
      });
      await clearLegacyBag();
      return view;
    })().finally(() => settles.delete(key));
    settles.set(key, pending);
  }
  return pending;
}

export function BagProvider({ children }: { children: ReactNode }) {
  const { user, ready: authReady } = useAuth();
  const userId = user?.id ?? null;
  const identity = userId ?? 'guest';
  const queryClient = useQueryClient();
  useBagLive(userId);
  const [notice, setNotice] = useState('');
  // The identity whose settle step has finished; until then its bag is not ready.
  const [settledFor, setSettledFor] = useState<string | null>(null);
  const latest = useRef(0);
  // Changes on their way, per identity: a guest change still out at sign-in says nothing about
  // the account bag.
  const inFlight = useRef(new Map<string, number>());
  const changing = (id: string) => inFlight.current.get(id) ?? 0;

  useEffect(() => {
    if (!authReady) return;
    let active = true;
    settleBag(userId)
      .then(async (view) => {
        // The merge answers with the bag it produced, so it is shown as is, with no second read.
        // A read that started before the merge landed would lack it, so it is cancelled first; a
        // change on its way wins, and the refetch after it settles brings the server's answer.
        if (!view || !active || changing(identity) > 0) return;
        await queryClient.cancelQueries({ queryKey: bagQueryKey(userId) });
        if (active && changing(identity) === 0) queryClient.setQueryData(bagQueryKey(userId), view);
      })
      .catch((error) => {
        if (active) setNotice(message(error));
      })
      // Only the identity still current here may mark itself settled; a remount shares the same
      // promise, so its own effect still marks it.
      .finally(() => {
        if (active) setSettledFor(identity);
      });
    return () => {
      active = false;
      // The next identity (or this one, returning) is not settled until its own step lands.
      setSettledFor(null);
    };
  }, [authReady, userId, identity, queryClient]);

  const bag = useQuery({
    queryKey: bagQueryKey(userId),
    enabled: authReady,
    queryFn: async () => {
      const view = await api<BagView>('/api/shopping', { auth: !!userId, guest: true });
      // A reply that lands while a change is on its way may predate it: keep what is shown,
      // and let the refetch after the last change settles bring the server's answer.
      if (changing(identity) > 0) return queryClient.getQueryData<BagView>(bagQueryKey(userId)) ?? view;
      return view;
    },
  });

  const change = useMutation({
    mutationKey: bagMutationKey,
    mutationFn: (op: BagOp) =>
      api<BagView>('/api/shopping', { method: 'PATCH', auth: !!userId, guest: true, body: { ops: [op] } }),
    onMutate: async (op) => {
      // The change belongs to the identity it was made as: its reply must not land in the bag of
      // whoever signed in or out meanwhile (React Query hands a pending change the newest callbacks).
      const key = bagQueryKey(userId);
      inFlight.current.set(identity, changing(identity) + 1);
      const request = ++latest.current;
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BagView>(key);
      if (previous) queryClient.setQueryData(key, applyOptimistic(previous, op));
      return { previous, request, key, identity };
    },
    onSuccess: (view, _op, context) => {
      // An older reply must not overwrite a newer change.
      if (context?.request === latest.current) queryClient.setQueryData(context.key, view);
      if (view.adjusted?.length) setNotice(CAPPED);
    },
    onError: (error, _op, context) => {
      if (context?.request === latest.current && context.previous)
        queryClient.setQueryData(context.key, context.previous);
      setNotice(message(error));
    },
    onSettled: (_view, _error, _op, context) => {
      if (!context) return;
      // isMutating() still counts the settling change inside onSettled, so the provider keeps its own count.
      const left = Math.max(0, changing(context.identity) - 1);
      inFlight.current.set(context.identity, left);
      if (left === 0) void queryClient.invalidateQueries({ queryKey: context.key });
    },
  });

  const lines = bag.data?.lines ?? [];
  const value: BagContext = {
    lines,
    count: lines.reduce((n, l) => n + l.quantity, 0),
    ready: authReady && bag.isFetched && settledFor === identity,
    signedIn: !!userId,
    notice,
    clearNotice: () => setNotice(''),
    error: asApiError(bag.error),
    retry: () => void bag.refetch(),
    async add(variantId, quantity) {
      const quantityOf = (view?: BagView) => view?.lines.find((l) => l.variantId === variantId)?.quantity ?? 0;
      const before = quantityOf(queryClient.getQueryData<BagView>(bagQueryKey(userId)));
      try {
        // Added only if the server's answer holds more than the bag did (a capped add may add nothing).
        return quantityOf(await change.mutateAsync({ op: 'add', variantId, quantity })) > before;
      } catch {
        return false;
      }
    },
    setQuantity(variantId, quantity) {
      change.mutate(
        quantity <= 0 ? { op: 'remove', variantId } : { op: 'set', variantId, quantity: Math.min(quantity, 20) },
      );
    },
    remove(variantId) {
      change.mutate({ op: 'remove', variantId });
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useBag() {
  const context = useContext(Context);
  if (!context) throw new Error('BagProvider is required');
  return context;
}
