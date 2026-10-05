import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/features/auth/provider';
import type { BagLine, BagView, CartLine, LineDetail } from '@/lib/types';
import { applyGuestOp, applyOptimistic, type BagOp } from './ops';
import { clearGuestBag, loadGuestBag, saveGuestBag } from './guest';

export const bagQueryKey = (userId: string | null) => ['bag', userId] as const;

type BagContext = {
  lines: BagLine[];
  count: number;
  ready: boolean;
  signedIn: boolean;
  notice: string;
  clearNotice: () => void;
  add: (variantId: string, quantity: number, stock: number) => Promise<boolean>;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
};
const Context = createContext<BagContext | null>(null);

const CAPPED = "Quantity updated to what's in stock";
const FAILED = 'Your bag could not be updated. Please try again.';
const message = (error: unknown) => (error instanceof ApiError && error.code === 'network' ? error.message : FAILED);

export function BagProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState('');
  const [guest, setGuest] = useState<CartLine[] | null>(null);
  const [merging, setMerging] = useState(false);
  const latest = useRef(0);

  // Guest bag: loaded from the device; details come from the public variants endpoint.
  useEffect(() => {
    if (!userId) loadGuestBag().then(setGuest);
  }, [userId]);
  const guestIds = (guest ?? []).map((l) => l.variantId).sort().join(',');
  const guestDetails = useQuery({
    queryKey: ['guest-lines', guestIds],
    enabled: !userId && guestIds.length > 0,
    queryFn: () => api<{ lines: LineDetail[] }>(`/api/catalogue/variants?ids=${guestIds}`),
  });

  // Signing in joins the guest bag to the account exactly once, then clears it.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const lines = await loadGuestBag();
      if (!lines.length) return;
      setMerging(true);
      try {
        await api('/api/shopping', { method: 'POST', auth: true, body: { action: 'merge', lines, wishlist: [] } });
        await clearGuestBag();
        if (active) setGuest([]);
        await queryClient.invalidateQueries({ queryKey: bagQueryKey(userId) });
      } catch (error) {
        if (active) setNotice(message(error));
      } finally {
        if (active) setMerging(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, queryClient]);

  const bag = useQuery({
    queryKey: bagQueryKey(userId),
    enabled: !!userId,
    queryFn: () => api<BagView>('/api/shopping', { auth: true }),
  });

  const change = useMutation({
    mutationFn: (op: BagOp) => api<BagView>('/api/shopping', { method: 'PATCH', auth: true, body: { ops: [op] } }),
    onMutate: async (op) => {
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
      void queryClient.invalidateQueries({ queryKey: bagQueryKey(userId) });
    },
  });

  const changeGuest = useCallback(async (op: BagOp, stock: number) => {
    const current = guest ?? (await loadGuestBag());
    const { lines, capped } = applyGuestOp(current, op, stock);
    setGuest(lines);
    await saveGuestBag(lines);
    if (capped) setNotice(CAPPED);
    return true;
  }, [guest]);

  const stockOf = (variantId: string) =>
    (userId ? bag.data?.lines : guestDetails.data?.lines)?.find((l) => l.variantId === variantId)?.variant.stock ?? 20;

  const guestLines: BagLine[] = (guest ?? []).flatMap((line) => {
    const found = guestDetails.data?.lines.find((d) => d.variantId === line.variantId);
    return found ? [{ ...found, quantity: Math.min(line.quantity, found.variant.stock, 20) }] : [];
  });
  const lines = userId ? (bag.data?.lines ?? []) : guestLines;

  const value: BagContext = {
    lines,
    count: lines.reduce((n, l) => n + l.quantity, 0),
    ready: userId ? bag.isFetched && !merging : guest !== null,
    signedIn: !!userId,
    notice,
    clearNotice: () => setNotice(''),
    async add(variantId, quantity, stock) {
      const op: BagOp = { op: 'add', variantId, quantity };
      if (!userId) return changeGuest(op, stock);
      try {
        await change.mutateAsync(op);
        return true;
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
