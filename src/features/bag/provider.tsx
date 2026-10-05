import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/features/auth/provider';
import type { BagLine, BagView, CartLine, LineDetail } from '@/lib/types';
import { applyGuestOp, applyOptimistic, type BagOp } from './ops';
import { clearGuestBag, loadGuestBag, saveGuestBag } from './guest';
import { bagMutationKey, bagQueryKey, refreshBag } from './keys';
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
  add: (variantId: string, quantity: number, stock: number) => Promise<boolean>;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
};
const Context = createContext<BagContext | null>(null);

const CAPPED = "Quantity updated to what's in stock";
const FAILED = 'Your bag could not be updated. Please try again.';
const message = (error: unknown) => (error instanceof ApiError && error.code === 'network' ? error.message : FAILED);
const asApiError = (error: Error | null) =>
  !error ? null : error instanceof ApiError ? error : new ApiError(error.message || FAILED, 0);

const sameLines = (a: CartLine[], b: CartLine[]) =>
  a.length === b.length && a.every((l) => b.some((m) => m.variantId === l.variantId && m.quantity === l.quantity));

// One merge per account at a time: a remount, or signing out and quickly back in, shares the POST in flight.
const merges = new Map<string, Promise<boolean>>();
function mergeGuestBag(userId: string) {
  let pending = merges.get(userId);
  if (!pending) {
    pending = (async () => {
      const lines = await loadGuestBag();
      if (!lines.length) return false;
      await api('/api/shopping', { method: 'POST', auth: true, body: { action: 'merge', lines, wishlist: [] } });
      await clearGuestBag();
      return true;
    })().finally(() => merges.delete(userId));
    merges.set(userId, pending);
  }
  return pending;
}

export function BagProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  useBagLive(userId);
  const [notice, setNotice] = useState('');
  const [guest, setGuestState] = useState<CartLine[] | null>(null);
  const guestRef = useRef<CartLine[] | null>(null);
  const guestQueue = useRef<Promise<unknown>>(Promise.resolve());
  // The account whose sign-in merge has finished; until then its bag is not ready.
  const [mergedFor, setMergedFor] = useState<string | null>(null);
  const latest = useRef(0);
  const inFlight = useRef(0);

  const setGuest = useCallback((lines: CartLine[]) => {
    guestRef.current = lines;
    setGuestState(lines);
  }, []);

  // Guest bag: loaded from the device; details come from the public variants endpoint.
  useEffect(() => {
    if (userId) return;
    guestRef.current = null;
    loadGuestBag().then((lines) => {
      if (guestRef.current === null) setGuest(lines);
    });
  }, [userId, setGuest]);
  const guestIds = (guest ?? []).map((l) => l.variantId).sort().join(',');
  const guestDetails = useQuery({
    queryKey: ['guest-lines', guestIds],
    enabled: !userId && guestIds.length > 0,
    placeholderData: keepPreviousData,
    queryFn: () => api<{ lines: LineDetail[] }>(`/api/catalogue/variants?ids=${guestIds}`),
  });

  // Signing in joins the guest bag to the account exactly once, then clears it.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    mergeGuestBag(userId)
      .then((merged) => {
        if (!merged) return;
        setGuest([]); // Storage is clear now, whoever is signed in by the time this lands.
        return refreshBag(queryClient, userId);
      })
      .catch((error: unknown) => {
        if (active) setNotice(message(error));
      })
      // Only the account still signed in here may mark its bag merged: a slower merge for an
      // earlier account must not overwrite the current one. A remount shares the same promise,
      // so its own effect still marks the account merged.
      .finally(() => {
        if (active) setMergedFor(userId);
      });
    return () => {
      active = false;
      // The next account (or this one, returning) is not merged until its own merge lands.
      setMergedFor(null);
    };
  }, [userId, queryClient, setGuest]);

  const bag = useQuery({
    queryKey: bagQueryKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      const view = await api<BagView>('/api/shopping', { auth: true });
      // A reply that lands while a change is on its way may predate it: keep what is shown,
      // and let the refetch after the last change settles bring the server's answer.
      if (inFlight.current > 0) return queryClient.getQueryData<BagView>(bagQueryKey(userId)) ?? view;
      return view;
    },
  });

  const change = useMutation({
    mutationKey: bagMutationKey,
    mutationFn: (op: BagOp) => api<BagView>('/api/shopping', { method: 'PATCH', auth: true, body: { ops: [op] } }),
    onMutate: async (op) => {
      inFlight.current += 1;
      const request = ++latest.current;
      await queryClient.cancelQueries({ queryKey: bagQueryKey(userId) });
      const previous = queryClient.getQueryData<BagView>(bagQueryKey(userId));
      if (previous) queryClient.setQueryData(bagQueryKey(userId), applyOptimistic(previous, op));
      return { previous, request };
    },
    onSuccess: (view, _op, context) => {
      // An older reply must not overwrite a newer change.
      if (context?.request === latest.current) queryClient.setQueryData(bagQueryKey(userId), view);
      if (view.adjusted?.length) setNotice(CAPPED);
    },
    onError: (error, _op, context) => {
      if (context?.request === latest.current && context.previous)
        queryClient.setQueryData(bagQueryKey(userId), context.previous);
      setNotice(message(error));
      // No refetch here: the one in onSettled runs once no change is left in flight.
    },
    onSettled: () => {
      // isMutating() still counts the settling change inside onSettled, so the provider keeps its own count.
      inFlight.current = Math.max(0, inFlight.current - 1);
      if (inFlight.current === 0) void queryClient.invalidateQueries({ queryKey: bagQueryKey(userId) });
    },
  });

  // Guest changes run one after another so quick taps compose; false means the bag did not change.
  const changeGuest = useCallback(
    (op: BagOp, stock: number) => {
      const run = guestQueue.current.then(async () => {
        const current = guestRef.current ?? (await loadGuestBag());
        const { lines, capped } = applyGuestOp(current, op, stock);
        if (capped) setNotice(CAPPED);
        if (sameLines(current, lines)) {
          if (guestRef.current === null) setGuest(current);
          return false;
        }
        setGuest(lines);
        await saveGuestBag(lines);
        return true;
      });
      guestQueue.current = run.catch(() => undefined);
      return run.catch(() => {
        setNotice(FAILED);
        return false;
      });
    },
    [setGuest],
  );

  const stockOf = (variantId: string) =>
    (userId ? bag.data?.lines : guestDetails.data?.lines)?.find((l) => l.variantId === variantId)?.variant.stock ?? 20;

  const guestLines: BagLine[] = (guest ?? []).flatMap((line) => {
    const found = guestDetails.data?.lines.find((d) => d.variantId === line.variantId);
    return found ? [{ ...found, quantity: Math.min(line.quantity, found.variant.stock, 20) }] : [];
  });
  const lines = userId ? (bag.data?.lines ?? []) : guestLines;
  const guestReady = guest !== null && (guestIds === '' || guestDetails.data !== undefined || guestDetails.isError);

  const value: BagContext = {
    lines,
    count: lines.reduce((n, l) => n + l.quantity, 0),
    ready: userId ? bag.isFetched && mergedFor === userId : guestReady,
    signedIn: !!userId,
    notice,
    clearNotice: () => setNotice(''),
    error: asApiError(userId ? bag.error : guestIds ? guestDetails.error : null),
    retry: () => void (userId ? bag.refetch() : guestDetails.refetch()),
    async add(variantId, quantity, stock) {
      const op: BagOp = { op: 'add', variantId, quantity };
      if (!userId) return changeGuest(op, stock);
      const quantityOf = (view?: BagView) => view?.lines.find((l) => l.variantId === variantId)?.quantity ?? 0;
      const before = quantityOf(queryClient.getQueryData<BagView>(bagQueryKey(userId)));
      try {
        // Added only if the server's answer holds more than the bag did (a capped add may add nothing).
        return quantityOf(await change.mutateAsync(op)) > before;
      } catch {
        return false;
      }
    },
    setQuantity(variantId, quantity) {
      const op: BagOp = quantity <= 0 ? { op: 'remove', variantId } : { op: 'set', variantId, quantity: Math.min(quantity, 20) };
      if (userId) change.mutate(op);
      else void changeGuest(op, stockOf(variantId));
    },
    remove(variantId) {
      const op: BagOp = { op: 'remove', variantId };
      if (userId) change.mutate(op);
      else void changeGuest(op, 0);
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useBag() {
  const context = useContext(Context);
  if (!context) throw new Error('BagProvider is required');
  return context;
}
