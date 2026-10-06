# Database-only Bag (mobile) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app stops keeping a bag on the phone. Guests and customers both use the server bag. Guests are identified by a random token in SecureStore, sent as `X-Guest-Token`.

**Architecture:**
- One React Query bag, keyed by identity, reads and changes `/api/shopping` for both guests and customers. It sends `Authorization: Bearer` when signed in, and always sends `X-Guest-Token`. The server applies the stock and 20 caps.
- A "settle" step runs once per identity:
  - **Signed in:** `POST merge` moves the guest bag, plus any old AsyncStorage bag, into the account.
  - **Guest:** an old AsyncStorage bag is uploaded once, if one exists.
- The old guest machinery is removed: the AsyncStorage bag, the variant details lookup, the change queue, and `applyGuestOp`.

**Tech Stack:** Expo SDK 57, expo-crypto, expo-secure-store, AsyncStorage (legacy read only), React Query 5, jest-expo + RNTL 14.

**Spec:** `C:/Users/TEHCDeveloper2/Desktop/VS-CODE-FILES/hng/the-oreva-edit/docs/superpowers/specs/2026-10-06-database-only-shopping-design.md` ("Mobile app" section). The web API side is built on the web branch `feat/db-only-shopping`, and not yet deployed.

## Global Constraints

- Repo `the-oreva-edit-mobile`, branch `feat/phase-1`. Add packages with `npx expo install`. Never push. Conventional commits, with no `Co-Authored-By` or AI attribution line.
- Guest token: 64 lowercase hex characters from a cryptographically secure source (`expo-crypto` `getRandomBytesAsync(32)`), stored in SecureStore under `oreva-guest-token`. Never log it or put it in a URL. Header name: `X-Guest-Token`.
- Nothing is written to AsyncStorage. The legacy key `oreva-bag-v1` is read once, sent in the first `merge`, and removed only after a successful reply.
- API contract:
  - `GET /api/shopping` returns `{ signedIn, userId?, lines, wishlist }`.
  - `PATCH { ops }` returns the same plus `adjusted`. The server caps quantities.
  - `POST { action: 'merge', lines?, wishlist? }`.
- `jest.mock` factories read `mock*` constants lazily.
- **Process hygiene:** stop only the PID you started, and never kill every `node.exe`.
- **Gate:** run `npm test` twice, once after `npx jest --clearCache`. Then run `npx tsc --noEmit` and `npx expo lint`.

## Review Focus

1. **Signing in with a guest bag:** the merge runs once per sign-in with both credentials. A remount during the merge doesn't post it twice.
2. **A brand-new install:** all requests use the same token, even when the first two changes are fired at once. The token is created once and reused across launches.
3. **Old AsyncStorage bag:** it is uploaded once and removed. It is kept if the upload fails.
4. **Signed-in behaviour is unchanged:** optimistic change and rollback, the capped notice, an older reply never overwrites a newer one, a single refetch after the last change, and Realtime refetches skipped while a change is pending.
5. **Cold start:** the bag isn't loaded as a guest before the stored session has been read (`useAuth().ready`).

---

### Task 1: Guest token and the API header

**Files:**
- Create: `src/lib/guest-token.ts`
- Modify: `src/lib/api.ts`, `package.json` (`expo-crypto`)
- Test: `tests/lib/guest-token.test.ts`, `tests/lib/api.test.ts` (add a case)

**Interfaces:**
- Produces: `getGuestToken(): Promise<string>` (cached, created once).
- Produces: `api(path, { method?, body?, auth?, guest? })`. `guest: true` adds the `X-Guest-Token` header.

- [ ] **Step 1:** `npx expo install expo-crypto`.

- [ ] **Step 2: Write the failing tests**

```ts
// tests/lib/guest-token.test.ts
import * as SecureStore from 'expo-secure-store';

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async (n: number) => Uint8Array.from({ length: n }, (_, i) => i)),
}));

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;
const load = () => require('@/lib/guest-token') as typeof import('@/lib/guest-token');

beforeEach(() => {
  store.clear();
  jest.resetModules();
});

describe('getGuestToken', () => {
  it('creates a 64-hex token once and keeps it in SecureStore', async () => {
    const { getGuestToken } = load();
    const [a, b] = await Promise.all([getGuestToken(), getGuestToken()]);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toBe(a);
    expect(store.get('oreva-guest-token')).toBe(a);
    expect(require('expo-crypto').getRandomBytesAsync).toHaveBeenCalledTimes(1);
  });

  it('reuses the stored token after a restart', async () => {
    store.set('oreva-guest-token', 'ab'.repeat(32));
    expect(await load().getGuestToken()).toBe('ab'.repeat(32));
  });

  it('replaces a malformed stored value', async () => {
    store.set('oreva-guest-token', 'nope');
    expect(await load().getGuestToken()).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

Add to `tests/lib/api.test.ts`. Mock `@/lib/guest-token` there with a lazy getter, e.g. `jest.mock('@/lib/guest-token', () => ({ getGuestToken: async () => 'cd'.repeat(32) }))`.

```ts
  it('sends the guest token header when asked', async () => {
    fetchMock.mockReturnValue(json(200, { signedIn: false, lines: [], wishlist: [] }));
    await api('/api/shopping', { guest: true });
    expect(fetchMock.mock.calls[0][1].headers['X-Guest-Token']).toBe('cd'.repeat(32));
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run `npx jest tests/lib/guest-token.test.ts tests/lib/api.test.ts`. Expected: FAIL, because the module doesn't exist yet and the header isn't sent.

- [ ] **Step 4: Implement**

```ts
// src/lib/guest-token.ts
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const KEY = 'oreva-guest-token';
const VALID = /^[0-9a-f]{64}$/;
let pending: Promise<string> | null = null;

/**
 * This install's guest identity for its server-side bag: 256 random bits kept in the keychain.
 * Concurrent first calls share one creation, so every request uses the same bag.
 */
export function getGuestToken() {
  pending ??= (async () => {
    const stored = await SecureStore.getItemAsync(KEY);
    if (stored && VALID.test(stored)) return stored;
    const bytes = await Crypto.getRandomBytesAsync(32);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync(KEY, token);
    return token;
  })().catch((error) => {
    pending = null;
    throw error;
  });
  return pending;
}
```

In `src/lib/api.ts`:
- Extend `Options` with `guest?: boolean`.
- In `send`, after the auth block, add: `if (guest) headers['X-Guest-Token'] = await getGuestToken();`.
- Import `getGuestToken` from `./guest-token`.
- Destructure `guest = false` with the other options.

- [ ] **Step 5:** Run the gate, then commit: `feat: give this install a secure guest token for its server bag`.

---

### Task 2: One server-backed bag for guests and customers

**Files:**
- Rewrite: `src/features/bag/provider.tsx` (the `useBag()` interface is unchanged)
- Create: `src/features/bag/legacy.ts`
- Delete: `src/features/bag/guest.ts`
- Modify: `src/features/bag/ops.ts` (remove `applyGuestOp`; keep `applyOptimistic` and `BagOp`)
- Tests:
  - Rewrite `tests/features/bag/provider.test.tsx`.
  - Update `tests/features/bag/ops.test.ts` (drop the `applyGuestOp` cases).

**Interfaces:**
- Consumes: `api(..., { auth, guest })`, `useAuth()` → `{ user, ready }`, `bagQueryKey`, `bagMutationKey`, `refreshBag` from `./keys`, and `useBagLive` (unchanged).
- Produces: the same `useBag()` shape (`lines, count, ready, signedIn, notice, clearNotice, error, retry, add, setQuantity, remove`).

- [ ] **Step 1: legacy.ts**

```ts
// src/features/bag/legacy.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cartSchema } from '@/lib/schemas';
import type { CartLine } from '@/lib/types';

const KEY = 'oreva-bag-v1';

/** A guest bag an older version kept on the phone; it is uploaded once, then removed. */
export async function loadLegacyBag(): Promise<CartLine[]> {
  try {
    return cartSchema.parse(JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]'));
  } catch {
    return [];
  }
}
export const clearLegacyBag = () => AsyncStorage.removeItem(KEY);
```

- [ ] **Step 2: Rewrite the provider tests (failing first)**

Keep every existing signed-in behaviour test, adapting the expected `api` options to `{ ..., auth: true, guest: true }`:
- applies a quantity change at once;
- rolls back and explains a rejected change;
- the capped notice;
- an older PATCH reply does not overwrite a newer one;
- a GET that resolves while a PATCH is pending does not overwrite the optimistic state;
- exactly one refetch after the last change settles;
- product screen outcomes via `add()`: returns false when nothing was added, true when the server's quantity grew.

Remove the tests for behaviour that no longer exists: the AsyncStorage guest bag, guest details loading, the guest queue, and local guest caps.

Add:
- **Guest:** reads `GET /api/shopping` with `{ auth: false, guest: true }`. `add` sends `PATCH` with `{ auth: false, guest: true }`. `AsyncStorage.setItem` is never called; spy on it.
- **Guest with a legacy bag** (`oreva-bag-v1` holds lines): sends one `POST` merge with `{ auth: false, guest: true, body: { action: 'merge', lines, wishlist: [] } }`. The key is removed after success. A second mount sends no `POST`.
- **Guest without a legacy bag:** sends no `POST`.
- **Signed in:** sends exactly one `POST` merge per sign-in with `{ auth: true, guest: true }` even without a legacy bag, then reads the account bag. Remounting the provider for the same user while the merge is in flight still sends one `POST`.
- **Merge failure:** the notice shows the message, the legacy key is kept, and the bag still loads and becomes ready.
- **Cold start:** while `useAuth().ready` is false, no request is made and `ready` is false.

- [ ] **Step 3: Rewrite `src/features/bag/provider.tsx`**

```tsx
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/features/auth/provider';
import type { BagLine, BagView } from '@/lib/types';
import { applyOptimistic, type BagOp } from './ops';
import { clearLegacyBag, loadLegacyBag } from './legacy';
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

/**
 * Settles where the bag lives, once per identity (a remount shares the request in flight):
 * signed in, the guest bag and any old on-phone bag move into the account; as a guest, an old
 * on-phone bag is uploaded. The old key is removed only after the server accepted it.
 */
const settles = new Map<string, Promise<void>>();
function settleBag(userId: string | null) {
  const key = userId ?? 'guest';
  let pending = settles.get(key);
  if (!pending) {
    pending = (async () => {
      const lines = await loadLegacyBag();
      if (!userId && !lines.length) return;
      await api('/api/shopping', {
        method: 'POST',
        auth: !!userId,
        guest: true,
        body: { action: 'merge', lines, wishlist: [] },
      });
      await clearLegacyBag();
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
  const inFlight = useRef(0);

  useEffect(() => {
    if (!authReady) return;
    let active = true;
    settleBag(userId)
      .then(() => refreshBag(queryClient, userId))
      .catch((error) => {
        if (active) setNotice(message(error));
      })
      .finally(() => {
        if (active) setSettledFor(identity);
      });
    return () => {
      active = false;
    };
  }, [authReady, userId, identity, queryClient]);

  const bag = useQuery({
    queryKey: bagQueryKey(userId),
    enabled: authReady,
    queryFn: async () => {
      const view = await api<BagView>('/api/shopping', { auth: !!userId, guest: true });
      // A reply that lands while a change is on its way may predate it: keep what is shown,
      // and let the refetch after the last change settles bring the server's answer.
      if (inFlight.current > 0) return queryClient.getQueryData<BagView>(bagQueryKey(userId)) ?? view;
      return view;
    },
  });

  const change = useMutation({
    mutationKey: bagMutationKey,
    mutationFn: (op: BagOp) =>
      api<BagView>('/api/shopping', { method: 'PATCH', auth: !!userId, guest: true, body: { ops: [op] } }),
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
    },
    onSettled: () => {
      // isMutating() still counts the settling change inside onSettled, so the provider keeps its own count.
      inFlight.current = Math.max(0, inFlight.current - 1);
      if (inFlight.current === 0) void queryClient.invalidateQueries({ queryKey: bagQueryKey(userId) });
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
```

`add`'s `stock` parameter is now unused because the server applies the caps. Keep it in the signature so callers don't change, and prefix it `_stock` if lint complains.

Delete `src/features/bag/guest.ts`. Remove `applyGuestOp` from `ops.ts` and its tests. Then check:
- `grep -rn "AsyncStorage" src` should match only `legacy.ts`;
- `grep -rn "guest.ts\|applyGuestOp\|loadGuestBag" src tests` should match nothing.

Check `src/features/auth/provider.tsx` `signOut`. It removes `['bag']` queries. The guest bag (`['bag', null]`) then loads through the API after sign-out, which is what we want.

- [ ] **Step 4:** Run the gate, then commit: `feat: keep the guest bag on the server instead of the phone`.

- [ ] **Step 5: README**

Add one line under "What it does": "Bags and wishlists live on the server for guests and customers; the app keeps only a random guest token in the keychain." Commit: `docs: note that the app keeps no bag on the phone`.
