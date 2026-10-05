# The Oreva Edit Mobile — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Expo app where customers sign in with their store account, browse the catalogue, pick variants, and keep a bag that syncs live with the website.

**Architecture:** Every read and write goes through the deployed web API (`https://the-oreva-edit.vercel.app/api/*`). The app sends the Supabase access token as `Authorization: Bearer`. supabase-js on the device only does three jobs: it stores the session (in an adapter that splits it across SecureStore entries), refreshes it, and receives Realtime events on `shopping_state`. Each event triggers a refetch of `GET /api/shopping`. React Query holds server state. Guests keep their bag in AsyncStorage, and it is merged into the account when they sign in.

**Tech Stack:** Expo SDK 57, Expo Router 57 (NativeTabs from `expo-router/unstable-native-tabs`), React Native 0.86, React 19.2, TypeScript 6, @supabase/supabase-js 2.117, @tanstack/react-query 5, react-hook-form + Zod 4, expo-secure-store, AsyncStorage, expo-image, expo-network, lucide-react-native, jest-expo + @testing-library/react-native 14.

**Spec:** `C:/Users/TEHCDeveloper2/Desktop/VS-CODE-FILES/hng/the-oreva-edit/docs/superpowers/specs/2026-10-05-mobile-app-cart-sync-design.md` (section "Mobile app" and "Physical phone verification"). API reference that this plan relies on: `docs/expo-sdk57-reference.md` in this repo.

## Global Constraints

- Repo: `C:/Users/TEHCDeveloper2/Desktop/VS-CODE-FILES/hng/the-oreva-edit-mobile`, branch `feat/phase-1` (created in Task 1). Package manager: npm. Always add packages with `npx expo install <pkg>` (dev: `npx expo install <pkg> -- --save-dev`).
- `AGENTS.md`: Expo changes every SDK, so don't rely on memory. Check `docs/expo-sdk57-reference.md` or the versioned docs at `https://docs.expo.dev/versions/v57.0.0/` before touching an Expo/RN API. Routes live only in `src/app/`; every file there is a screen. Tests and non-route code stay outside `src/app/`. Never create `ios/` or `android/`.
- Commit messages are conventional (`feat:`, `fix:`, `test:`, `chore:`, `docs:`). Never add `Co-Authored-By` or any AI attribution line.
- The API is fixed. These are the shapes the deployed server returns:
  - `POST /api/auth/sign-in` `{ email, password, client: 'mobile' }` returns `{ ok: true, session: { access_token, refresh_token, expires_at } }`. A wrong password gives 401 `{ error: 'Email or password is incorrect.' }`.
  - `POST /api/auth/sign-up` `{ firstName, lastName, email, password, phone, client: 'mobile' }` returns the same session shape. When Supabase "Confirm email" is on, it returns `{ ok: true, confirm: true }`. An existing account gives 409 `{ error, code: 'account_exists' }`.
  - `POST /api/auth/forgot-password` `{ email, client: 'mobile' }` returns `{ ok: true }`.
  - `GET /api/catalogue/categories` returns `{ categories: Category[] }`.
  - `GET /api/catalogue/products?audience=&category=&page=` returns `{ products: ProductSummary[], page, pageSize: 12, total }`.
  - `GET /api/catalogue/products/<slug>` returns `{ product: Product }`, or 404.
  - `GET /api/catalogue/variants?ids=a,b` returns `{ lines: LineDetail[] }`.
  - `GET /api/shopping` (bearer) returns `{ signedIn: true, updatedAt, lines: (LineDetail & { quantity })[], wishlist }` or `{ signedIn: false }`.
  - `PATCH /api/shopping { ops }` (bearer) returns the same shape plus `adjusted: string[]`. Ops are `add`/`set` `{ variantId, quantity 1–20 }` and `remove` `{ variantId }`, with 1–50 ops per call. Conflicts give 409 `code: 'cart_conflict'`.
  - `POST /api/shopping { action: 'merge', lines, wishlist }` (bearer) returns `{ signedIn: true, userId, lines, wishlist }`.
  - An expired or invalid bearer token gives 401 `code: 'session_expired'`. Errors are `{ error, code? }`.
- Money is integer kobo, shown with the web's `money()` (e.g. `₦28,500`). Image paths from the API are site-relative (`/images/shirt.jpg`), so prefix them with `EXPO_PUBLIC_API_URL`.
- Cart limits are the same as the web: quantity 1–20, capped at stock, at most 50 lines.
- Copy is user-facing and matches the web: "Email or password is incorrect.", "Can't reach the store. Check your connection and try again.", "Quantity updated to what's in stock", "Your bag could not be updated. Please try again."
- Brand: background `#faf8f3`, surface `#f0ece4`, foreground `#292721`, muted `#6b655e`, primary `#62283a`, border `#dcd7ce`, destructive `#a12d2d`, success `#2f6249`. Fonts are Cormorant Garamond (display) and Manrope (text). Corners are square.
- `jest.mock` factories may only reference outer variables whose names start with `mock` (babel-plugin-jest-hoist rule); keep that naming when adding mocks.
- Gate at the end of every task: `npm test`, `npx tsc --noEmit`, `npx expo lint`. `tsc` needs generated router types: if it reports missing `expo-env.d.ts`/typed-route errors, run `npx expo start --offline` for about 20 seconds in the background, stop it, and re-run.

## Review Focus

1. **Token expires while the app is backgrounded.** The first bag request after returning should refresh the token once and succeed. If the refresh fails, the customer is signed out with a message and never sees a crash or an endless retry (Task 3 tests).
2. **No network at launch or mid-session.** The catalogue shows an inline error with Retry and the banner appears, the guest bag still works offline, and a failed bag change on a signed-in bag rolls back with the message (Tasks 3, 6, 7 tests).
3. **Guest bag holding items when the customer signs in.** The items are merged into the account exactly once and the local guest bag is cleared. If the merge fails, the guest bag is kept (Task 6 test).
4. **Adding more than stock allows.** The bag shows the capped quantity and "Quantity updated to what's in stock". The quantity stepper never goes above `min(stock, 20)` (Tasks 6 tests).
5. **Session larger than SecureStore's ~2 KB per value.** It is stored across chunks and read back intact. A shorter session that overwrites a longer one leaves no stale tail (Task 2 tests).

---

## File Structure

```
src/app/                         routes only
  _layout.tsx                    fonts, splash, QueryClientProvider, AuthProvider, BagProvider, Stack
  (tabs)/_layout.tsx             NativeTabs: Shop · Bag (badge) · Account
  (tabs)/index.tsx               Shop
  (tabs)/bag.tsx                 Bag
  (tabs)/account.tsx             Account
  product/[slug].tsx             Product
  sign-in.tsx  sign-up.tsx  forgot-password.tsx   modals
src/lib/config.ts                env values, assetUrl()
src/lib/money.ts                 copied from web
src/lib/secure-storage.ts        chunked SecureStore adapter
src/lib/supabase.ts              supabase client + AppState refresh
src/lib/api.ts                   fetch wrapper, ApiError
src/lib/query.ts                 QueryClient + onlineManager
src/lib/schemas.ts               Zod schemas copied from web
src/lib/types.ts                 API types
src/features/auth/provider.tsx   AuthProvider, useAuth
src/features/auth/forms/*.tsx    SignInForm, SignUpForm, ForgotPasswordForm
src/features/catalogue/queries.ts   useCategories, useProducts, useProduct
src/features/catalogue/selection.ts copied from web
src/features/catalogue/*.tsx     ProductCard, VariantPicker, AudienceFilter
src/features/bag/ops.ts          pure guest ops + optimistic apply
src/features/bag/guest.ts        AsyncStorage persistence
src/features/bag/provider.tsx    BagProvider, useBag (guest + signed-in, merge)
src/features/bag/live.ts         useBagLive (Realtime + foreground refetch)
src/components/                  theme.ts, AppText.tsx, Button.tsx, Field.tsx, Price.tsx, NetworkBanner.tsx, QuantityStepper.tsx, ErrorState.tsx
tests/                           jest tests, mirroring src/
jest.setup.ts                    storage mocks
```

---

### Task 1: Project foundation (tooling, cleanup, theme, money)

**Files:**
- Modify: `package.json`, `app.json`, `.gitignore`, `src/app/_layout.tsx`
- Create: `jest.setup.ts`, `.env.example`, `eslint.config.js` (generated), `src/lib/money.ts`, `src/lib/config.ts`, `src/components/theme.ts`, `src/components/AppText.tsx`, `src/app/(tabs)/_layout.tsx`, `src/app/(tabs)/index.tsx`, `src/app/(tabs)/bag.tsx`, `src/app/(tabs)/account.tsx`
- Delete: `src/app/index.tsx`, `src/app/explore.tsx`, `src/components/app-tabs.tsx`, `src/components/app-tabs.web.tsx`, `src/components/animated-icon.tsx`, `src/components/animated-icon.web.tsx`, `src/components/animated-icon.module.css`, `src/components/hint-row.tsx`, `src/components/web-badge.tsx`, `src/components/external-link.tsx`, `src/components/ui/collapsible.tsx`, `src/components/themed-text.tsx`, `src/components/themed-view.tsx`, `src/constants/theme.ts`, `src/hooks/*`, `src/global.css`, `scripts/reset-project.js`, `assets/images/tabIcons/`, `assets/images/react-logo*.png`, `assets/images/expo-*.png`, `assets/images/logo-glow.png`, `assets/images/tutorial-web.png`
- Test: `tests/lib/money.test.ts`, `tests/lib/config.test.ts`

**Interfaces:**
- Produces: `money(kobo: number): string`, `apiUrl`, `supabaseUrl`, `supabaseKey`, `assetUrl(path?: string | null): string | null`, `colors`, `fonts`, `AppText` (props `variant?: 'display' | 'title' | 'body' | 'label' | 'muted'` + RN `TextProps`).

- [ ] **Step 1: Commit the dependencies already installed, then branch**

```bash
git switch -c feat/phase-1
git add package.json package-lock.json app.json
git commit -m "chore: add Phase 1 dependencies"
```

- [ ] **Step 2: Install the missing tooling**

```bash
npx expo install expo-network
npx expo install @types/jest test-renderer@1.2 eslint eslint-config-expo -- --save-dev
```

Then edit `package.json`:
- Move `jest` and `jest-expo` from `dependencies` to `devDependencies` (keep their versions).
- Set the scripts to:

```json
"scripts": {
  "start": "expo start",
  "android": "expo start --android",
  "ios": "expo start --ios",
  "lint": "expo lint",
  "typecheck": "tsc --noEmit",
  "test": "jest"
},
"jest": {
  "preset": "jest-expo",
  "setupFiles": ["<rootDir>/jest.setup.ts"],
  "moduleNameMapper": {
    "^@/assets/(.*)$": "<rootDir>/assets/$1",
    "^@/(.*)$": "<rootDir>/src/$1"
  }
}
```

Run `npm install` so the lockfile matches.

Create `eslint.config.js`:

```js
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
module.exports = defineConfig([expoConfig, { ignores: ['dist/*', '.expo/*'] }]);
```

- [ ] **Step 3: Test setup and environment files**

`jest.setup.ts`:

```ts
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// jest-expo stubs SecureStore with empty functions; tests need a working in-memory store.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK: 0,
    WHEN_UNLOCKED: 5,
    __store: store,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});
```

`.env.example`:

```
# Copy to .env.local (git-ignored). The publishable key is safe to ship in the app.
EXPO_PUBLIC_API_URL=https://the-oreva-edit.vercel.app
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Append to `.gitignore`:

```
# local env file
.env
```

- [ ] **Step 4: Delete the template boilerplate**

Delete every file listed under "Delete" above (use `git rm`). Remove the `reset-project` script from `package.json` if it is still there. Do not run `npm run reset-project`, because it moves all of `src/`.

- [ ] **Step 5: Write the failing tests**

```ts
// tests/lib/money.test.ts
import { money } from '@/lib/money';

describe('money', () => {
  it('formats whole naira without decimals', () => {
    expect(money(2850000)).toBe('₦28,500');
  });
  it('keeps kobo when present', () => {
    expect(money(150)).toBe('₦1.50');
  });
});
```

```ts
// tests/lib/config.test.ts
describe('assetUrl', () => {
  const load = () => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_API_URL = 'https://the-oreva-edit.vercel.app';
    return require('@/lib/config') as typeof import('@/lib/config');
  };
  it('prefixes site-relative paths with the API origin', () => {
    expect(load().assetUrl('/images/shirt.jpg')).toBe(
      'https://the-oreva-edit.vercel.app/images/shirt.jpg',
    );
  });
  it('keeps absolute URLs and handles missing paths', () => {
    const { assetUrl } = load();
    expect(assetUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
    expect(assetUrl(null)).toBeNull();
    expect(assetUrl('')).toBeNull();
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npm test -- tests/lib`
Expected: FAIL, cannot find module `@/lib/money` / `@/lib/config`.

- [ ] **Step 7: Implement money, config and theme**

```ts
// src/lib/money.ts — copied from the web store's lib/money.ts
export function money(kobo: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: kobo % 100 === 0 ? 0 : 2,
  }).format(kobo / 100);
}
```

If Node's ICU prints `NGN` instead of `₦` and fails the test, the runtime lacks full ICU data. Note it in the report and change the expectation to whatever `Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' })` produces. Do not hand-roll a formatter.

```ts
// src/lib/config.ts
// Only the literal `process.env.EXPO_PUBLIC_*` form is inlined by Expo; do not destructure.
export const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/** The API returns site-relative image paths; the app needs absolute URLs. */
export function assetUrl(path?: string | null) {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : `${apiUrl}${path}`;
}
```

```ts
// src/components/theme.ts
export const colors = {
  background: '#faf8f3',
  surface: '#f0ece4',
  elevated: '#fffdf8',
  foreground: '#292721',
  muted: '#6b655e',
  primary: '#62283a',
  primaryPressed: '#491b2b',
  border: '#dcd7ce',
  destructive: '#a12d2d',
  success: '#2f6249',
} as const;

export const fonts = {
  display: 'CormorantGaramond_500Medium',
  displayBold: 'CormorantGaramond_600SemiBold',
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodyBold: 'Manrope_700Bold',
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
```

```tsx
// src/components/AppText.tsx
import { StyleSheet, Text, type TextProps } from 'react-native';
import { colors, fonts } from './theme';

type Variant = 'display' | 'title' | 'body' | 'label' | 'muted';

export function AppText({ variant = 'body', style, ...props }: TextProps & { variant?: Variant }) {
  return <Text {...props} style={[styles[variant], style]} />;
}

const styles = StyleSheet.create({
  display: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, color: colors.foreground },
  title: { fontFamily: fonts.displayBold, fontSize: 22, lineHeight: 28, color: colors.foreground },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.foreground },
  label: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: colors.foreground, letterSpacing: 0.4 },
  muted: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
});
```

- [ ] **Step 8: Root layout and placeholder tabs**

```tsx
// src/app/_layout.tsx
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  CormorantGaramond_500Medium,
  CormorantGaramond_600SemiBold,
} from '@expo-google-fonts/cormorant-garamond';
import { Manrope_400Regular, Manrope_500Medium, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { colors } from '@/components/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    CormorantGaramond_500Medium,
    CormorantGaramond_600SemiBold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_700Bold,
  });
  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);
  if (!loaded && !error) return null;
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.foreground,
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
```

```tsx
// src/app/(tabs)/_layout.tsx
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { colors } from '@/components/theme';

export default function TabsLayout() {
  return (
    <NativeTabs backgroundColor={colors.background} indicatorColor={colors.surface}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Shop</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'bag', selected: 'bag.fill' }} md="storefront" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="bag">
        <NativeTabs.Trigger.Label>Bag</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="handbag" md="shopping_bag" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person" md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
```

If `tsc` rejects an `sf` or `md` icon name, pick the closest valid name from the type's suggestions and note it in the report.

Each of `src/app/(tabs)/index.tsx`, `bag.tsx`, `account.tsx` is a placeholder for now. Use the title `Shop`, `Bag` and `Account` respectively; this is `index.tsx`:

```tsx
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';

export default function ShopScreen() {
  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <AppText variant="display">Shop</AppText>
    </SafeAreaView>
  );
}
```

- [ ] **Step 9: App identity**

In `app.json`:
- Set `"name": "The Oreva Edit"`.
- Set the `expo-splash-screen` plugin's `backgroundColor` to `#faf8f3`.
- Set `android.adaptiveIcon.backgroundColor` to `#faf8f3`.
- Leave the icon images as they are; replacing them is out of Phase 1 scope.
- Remove the `web` block only if `npx expo-doctor` or `tsc` complain about it. Otherwise leave it.

- [ ] **Step 10: Run the gate**

Run: `npm test`, then `npx tsc --noEmit` (generate router types first per Global Constraints), then `npx expo lint`.
Expected: tests PASS (4), tsc clean, lint clean.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: set up tooling, brand theme and tab skeleton"
```

---

### Task 2: Session storage and the Supabase client

**Files:**
- Create: `src/lib/secure-storage.ts`, `src/lib/supabase.ts`
- Test: `tests/lib/secure-storage.test.ts`

**Interfaces:**
- Consumes: `supabaseUrl`, `supabaseKey` (Task 1).
- Produces: `secureStorage: { getItem(key): Promise<string|null>; setItem(key, value): Promise<void>; removeItem(key): Promise<void> }`, `supabase` (SupabaseClient).

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/secure-storage.test.ts
import * as SecureStore from 'expo-secure-store';
import { secureStorage } from '@/lib/secure-storage';

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

beforeEach(() => store.clear());

describe('secureStorage', () => {
  it('round-trips a value larger than one SecureStore entry', async () => {
    const session = JSON.stringify({ access_token: 'x'.repeat(5000), refresh_token: 'r' });
    await secureStorage.setItem('sb-auth', session);
    expect(await secureStorage.getItem('sb-auth')).toBe(session);
    expect([...store.values()].every((v) => v.length <= 1800)).toBe(true);
  });

  it('removes the tail of a longer value it overwrote', async () => {
    await secureStorage.setItem('sb-auth', 'a'.repeat(4000));
    await secureStorage.setItem('sb-auth', 'short');
    expect(await secureStorage.getItem('sb-auth')).toBe('short');
    expect([...store.keys()].sort()).toEqual(['sb-auth.0', 'sb-auth.count']);
  });

  it('returns null for a missing or partly missing value', async () => {
    expect(await secureStorage.getItem('nothing')).toBeNull();
    await secureStorage.setItem('sb-auth', 'b'.repeat(4000));
    store.delete('sb-auth.1');
    expect(await secureStorage.getItem('sb-auth')).toBeNull();
  });

  it('removes every chunk', async () => {
    await secureStorage.setItem('sb-auth', 'c'.repeat(4000));
    await secureStorage.removeItem('sb-auth');
    expect(store.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/lib/secure-storage.test.ts`
Expected: FAIL, cannot find module `@/lib/secure-storage`.

- [ ] **Step 3: Implement the adapter**

```ts
// src/lib/secure-storage.ts
import * as SecureStore from 'expo-secure-store';

// SecureStore rejects large values on some platforms (~2 KB); a Supabase session is bigger,
// so it is split across numbered entries with the count written last.
const CHUNK = 1800;
const options = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

async function count(key: string) {
  return Number(await SecureStore.getItemAsync(`${key}.count`, options)) || 0;
}

async function removeChunks(key: string, from: number, to: number) {
  await Promise.all(
    Array.from({ length: Math.max(0, to - from) }, (_, i) =>
      SecureStore.deleteItemAsync(`${key}.${from + i}`, options),
    ),
  );
}

export const secureStorage = {
  async getItem(key: string) {
    const n = await count(key);
    if (!n) return null;
    const parts = await Promise.all(
      Array.from({ length: n }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`, options)),
    );
    return parts.some((part) => part === null) ? null : parts.join('');
  },
  async setItem(key: string, value: string) {
    const previous = await count(key);
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, 'g')) ?? [''];
    await Promise.all(parts.map((part, i) => SecureStore.setItemAsync(`${key}.${i}`, part, options)));
    await SecureStore.setItemAsync(`${key}.count`, String(parts.length), options);
    await removeChunks(key, parts.length, previous);
  },
  async removeItem(key: string) {
    await removeChunks(key, 0, await count(key));
    await SecureStore.deleteItemAsync(`${key}.count`, options);
  },
};
```

- [ ] **Step 4: Implement the Supabase client**

```ts
// src/lib/supabase.ts
import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { supabaseKey, supabaseUrl } from './config';
import { secureStorage } from './secure-storage';

/** Holds and refreshes the session and receives Realtime events; data goes through the API. */
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
```

Do not write a unit test for `supabase.ts`. It is configuration; Task 8's phone check covers it. Every other test mocks `@/lib/supabase`.

- [ ] **Step 5: Run the gate and commit**

Run: `npm test`, `npx tsc --noEmit`, `npx expo lint`. Expected: all pass.

```bash
git add src/lib/secure-storage.ts src/lib/supabase.ts tests/lib/secure-storage.test.ts
git commit -m "feat: store the Supabase session securely across chunks"
```

---

### Task 3: API client

**Files:**
- Create: `src/lib/api.ts`, `src/lib/types.ts`
- Test: `tests/lib/api.test.ts`

**Interfaces:**
- Consumes: `apiUrl` (Task 1), `supabase` (Task 2).
- Produces:
  - `class ApiError extends Error { status: number; code?: string }`.
  - `api<T>(path: string, options?: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown; auth?: boolean }): Promise<T>`.
  - The types in `src/lib/types.ts`: `Category`, `ProductSummary`, `Product`, `Variant`, `CartLine`, `LineDetail`, `BagLine`, `BagView`, `Tokens`.

- [ ] **Step 1: Write the types (copied from the web API's shapes)**

```ts
// src/lib/types.ts
export type Category = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  position: number;
  active: boolean;
};
export type ProductSummary = {
  id: string;
  slug: string;
  name: string;
  price: number;
  compare_at: number | null;
  image: string | null;
  alt: string;
  audience: string;
  category: string;
  inStock: boolean;
};
export type Variant = {
  id: string;
  sku: string;
  attributes: Record<string, string>;
  price: number | null;
  stock: number;
  image?: string | null;
};
export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  short_description: string;
  category: string;
  audience: string;
  status: 'draft' | 'active' | 'archived';
  price: number;
  compare_at: number | null;
  images: string[];
  alt: string;
  variants: Variant[];
  details: string[];
  care: string;
};
export type CartLine = { variantId: string; quantity: number };
export type LineDetail = {
  variantId: string;
  product: { id: string; slug: string; name: string; image: string | null; alt: string; price: number };
  variant: { attributes: Record<string, string>; price: number | null; stock: number };
};
export type BagLine = LineDetail & { quantity: number };
export type BagView = { lines: BagLine[]; wishlist: string[]; adjusted?: string[] };
export type Tokens = { access_token: string; refresh_token: string; expires_at?: number };
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/lib/api.test.ts
const mockAuth = {
  getSession: jest.fn(),
  refreshSession: jest.fn(),
  signOut: jest.fn(),
};
jest.mock('@/lib/supabase', () => ({ supabase: { auth: mockAuth } }));
jest.mock('@/lib/config', () => ({ apiUrl: 'https://store.test' }));

import { api, ApiError } from '@/lib/api';

const json = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response);
let fetchMock: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock = jest.fn();
  global.fetch = fetchMock;
  mockAuth.getSession.mockResolvedValue({ data: { session: { access_token: 'token-1' } } });
});

describe('api', () => {
  it('calls the store API and returns JSON', async () => {
    fetchMock.mockReturnValue(json(200, { categories: [] }));
    await expect(api('/api/catalogue/categories')).resolves.toEqual({ categories: [] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://store.test/api/catalogue/categories');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('sends the bearer token and JSON body for authenticated calls', async () => {
    fetchMock.mockReturnValue(json(200, { lines: [] }));
    await api('/api/shopping', { method: 'PATCH', body: { ops: [] }, auth: true });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('PATCH');
    expect(init.headers.Authorization).toBe('Bearer token-1');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ ops: [] }));
  });

  it('turns server errors into ApiError with the server message and code', async () => {
    fetchMock.mockReturnValue(json(409, { error: 'Your bag changed on another device.', code: 'cart_conflict' }));
    await expect(api('/api/shopping', { auth: true })).rejects.toMatchObject({
      status: 409,
      code: 'cart_conflict',
      message: 'Your bag changed on another device.',
    });
  });

  it('reports an unreachable store as a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const failure = api('/api/catalogue/categories');
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({
      status: 0,
      code: 'network',
      message: "Can't reach the store. Check your connection and try again.",
    });
  });

  it('refreshes an expired session once and retries', async () => {
    fetchMock
      .mockReturnValueOnce(json(401, { error: 'Please sign in again.', code: 'session_expired' }))
      .mockReturnValueOnce(json(200, { signedIn: true }));
    mockAuth.refreshSession.mockResolvedValue({ error: null });
    mockAuth.getSession
      .mockResolvedValueOnce({ data: { session: { access_token: 'old' } } })
      .mockResolvedValueOnce({ data: { session: { access_token: 'new' } } });
    await expect(api('/api/shopping', { auth: true })).resolves.toEqual({ signedIn: true });
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer new');
    expect(mockAuth.signOut).not.toHaveBeenCalled();
  });

  it('signs out when the refresh fails, without looping', async () => {
    fetchMock.mockReturnValue(json(401, { error: 'Please sign in again.', code: 'session_expired' }));
    mockAuth.refreshSession.mockResolvedValue({ error: new Error('expired') });
    await expect(api('/api/shopping', { auth: true })).rejects.toMatchObject({
      status: 401,
      code: 'session_expired',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockAuth.signOut).toHaveBeenCalledTimes(1);
  });

  it('refuses an authenticated call with no session', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });
    await expect(api('/api/shopping', { auth: true })).rejects.toMatchObject({
      status: 401,
      code: 'session_expired',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- tests/lib/api.test.ts`
Expected: FAIL, cannot find module `@/lib/api`.

- [ ] **Step 4: Implement the client**

```ts
// src/lib/api.ts
import { apiUrl } from './config';
import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

type Options = { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown; auth?: boolean };

const TIMEOUT_MS = 8000;
const offline = () =>
  new ApiError("Can't reach the store. Check your connection and try again.", 0, 'network');
const expired = () => new ApiError('Please sign in again.', 401, 'session_expired');

async function send(path: string, { method = 'GET', body, auth = false }: Options) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw expired();
    headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${apiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw offline();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calls the store API. An expired session is refreshed once and the call retried; if the
 * refresh fails the customer is signed out and the call fails with `session_expired`.
 */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  let response = await send(path, options);
  let data = await response.json().catch(() => ({}));
  if (options.auth && response.status === 401 && data.code === 'session_expired') {
    const { error } = await supabase.auth.refreshSession();
    if (error) {
      await supabase.auth.signOut();
      throw expired();
    }
    response = await send(path, options);
    data = await response.json().catch(() => ({}));
  }
  if (response.ok) return data as T;
  throw new ApiError(
    data.error || 'Something went wrong. Please try again.',
    response.status,
    data.code,
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- tests/lib/api.test.ts`
Expected: PASS (7).

- [ ] **Step 6: Gate and commit**

Run `npm test`, `npx tsc --noEmit`, `npx expo lint`.

```bash
git add src/lib/api.ts src/lib/types.ts tests/lib/api.test.ts
git commit -m "feat: call the store API with bearer sessions and one refresh retry"
```

---

### Task 4: Accounts — provider, forms and screens

**Files:**
- Create: `src/lib/schemas.ts`, `src/lib/query.ts`, `src/features/auth/provider.tsx`, `src/features/auth/forms/SignInForm.tsx`, `src/features/auth/forms/SignUpForm.tsx`, `src/features/auth/forms/ForgotPasswordForm.tsx`, `src/components/Button.tsx`, `src/components/Field.tsx`, `src/app/sign-in.tsx`, `src/app/sign-up.tsx`, `src/app/forgot-password.tsx`
- Modify: `src/app/_layout.tsx` (providers + modal screens), `src/app/(tabs)/account.tsx`
- Test: `tests/lib/schemas.test.ts`, `tests/features/auth/provider.test.tsx`, `tests/features/auth/sign-in-form.test.tsx`

**Interfaces:**
- Consumes: `api`, `ApiError`, `Tokens` (Task 3), `supabase` (Task 2).
- Produces:
  - `signInSchema`, `signUpSchema`, `emailOnlySchema`, `cartSchema`, and the types `SignInInput`, `SignUpInput`.
  - `queryClient`.
  - `AuthProvider`, and `useAuth(): { user: User | null; ready: boolean; signIn(input: SignInInput): Promise<void>; signUp(input: SignUpInput): Promise<'signed-in' | 'confirm'>; signOut(): Promise<void>; forgotPassword(email: string): Promise<void> }`.
  - `Button` (props `title`, `onPress`, `variant?: 'primary' | 'secondary'`, `loading?`, `disabled?`, `accessibilityLabel?`).
  - `Field` (props `label`, `error?`, `required?` + `TextInputProps`, forwards ref).

- [ ] **Step 1: Copy the schemas (web `lib/validation.ts`, same rules and messages)**

```ts
// src/lib/schemas.ts — same rules and messages as the web store's lib/validation.ts
import { z } from 'zod';

const nigerianMobile = /^(?:\+234|234|0)[789][01]\d{8}$/;
export const localPhone = (phone: string) =>
  phone.trim().replace(/^\+?234(?=[789][01]\d{8}$)/, '0');

// 72 bytes is the bcrypt limit Supabase Auth applies.
const password = z.string().min(8, 'Use at least 8 characters').max(72, 'Use 72 characters or fewer');
const accountEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address').max(254));

export const signUpSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name').max(60),
  lastName: z.string().trim().min(1, 'Enter your last name').max(60),
  email: accountEmail,
  password,
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || nigerianMobile.test(v), 'Enter a Nigerian mobile number, e.g. 08012345678')
    .transform(localPhone),
});
export type SignUpInput = z.input<typeof signUpSchema>;
export const signInSchema = z.object({
  email: accountEmail,
  password: z.string().min(1, 'Enter your password').max(1024),
});
export type SignInInput = z.input<typeof signInSchema>;
export const emailOnlySchema = z.object({ email: accountEmail });
export const cartSchema = z
  .array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(20) }))
  .max(50);
```

```ts
// tests/lib/schemas.test.ts
import { signInSchema, signUpSchema } from '@/lib/schemas';

const valid = { firstName: 'Mary Jane', lastName: 'Bello', email: 'Tolu@Example.com ', password: 'correct horse', phone: '' };

describe('account schemas', () => {
  it('normalises email and phone like the website', () => {
    const parsed = signUpSchema.parse({ ...valid, phone: '+2348012345678' });
    expect(parsed).toMatchObject({ email: 'tolu@example.com', phone: '08012345678' });
  });
  it.each([
    [{ password: 'short' }, 'Use at least 8 characters'],
    [{ phone: '12345' }, 'Enter a Nigerian mobile number, e.g. 08012345678'],
    [{ email: 'nope' }, 'Enter a valid email address'],
  ])('rejects %o', (change, message) => {
    const result = signUpSchema.safeParse({ ...valid, ...change });
    expect(result.error?.issues[0].message).toBe(message);
  });
  it('only needs a non-empty password to sign in', () => {
    expect(signInSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing provider test**

```tsx
// tests/features/auth/provider.test.tsx
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Text, Pressable } from 'react-native';

const mockAuth = {
  getSession: jest.fn(),
  onAuthStateChange: jest.fn(),
  setSession: jest.fn(),
  signOut: jest.fn(),
};
jest.mock('@/lib/supabase', () => ({ supabase: { auth: mockAuth } }));
const mockApi = jest.fn();
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return { ...actual, api: (...args: unknown[]) => mockApi(...args) };
});

import { AuthProvider, useAuth } from '@/features/auth/provider';

let emit: (event: string, session: unknown) => void = () => {};
const tokens = { access_token: 'a.b.c', refresh_token: 'r', expires_at: 1 };

function Probe({ onResult }: { onResult?: (r: unknown) => void }) {
  const { user, ready, signIn, signUp } = useAuth();
  return (
    <>
      <Text>{ready ? `user:${user?.id ?? 'none'}` : 'loading'}</Text>
      <Pressable onPress={() => signIn({ email: 'a@b.co', password: 'pw' })}>
        <Text>sign in</Text>
      </Pressable>
      <Pressable
        onPress={async () =>
          onResult?.(await signUp({ firstName: 'A', lastName: 'B', email: 'a@b.co', password: 'longenough', phone: '' }))
        }
      >
        <Text>sign up</Text>
      </Pressable>
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.getSession.mockResolvedValue({ data: { session: null } });
  mockAuth.onAuthStateChange.mockImplementation((cb) => {
    emit = cb;
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  });
  mockAuth.setSession.mockImplementation(async () => {
    emit('SIGNED_IN', { user: { id: 'user-1' } });
    return { data: {}, error: null };
  });
});

describe('AuthProvider', () => {
  it('starts as a guest once the stored session is read', async () => {
    await render(<AuthProvider><Probe /></AuthProvider>);
    expect(await screen.findByText('user:none')).toBeOnTheScreen();
  });

  it('signs in through the store API in mobile mode and adopts the session', async () => {
    mockApi.mockResolvedValue({ ok: true, session: tokens });
    const user = userEvent.setup();
    await render(<AuthProvider><Probe /></AuthProvider>);
    await user.press(await screen.findByText('sign in'));
    expect(mockApi).toHaveBeenCalledWith('/api/auth/sign-in', {
      method: 'POST',
      body: { email: 'a@b.co', password: 'pw', client: 'mobile' },
    });
    expect(mockAuth.setSession).toHaveBeenCalledWith({ access_token: 'a.b.c', refresh_token: 'r' });
    await waitFor(() => expect(screen.getByText('user:user-1')).toBeOnTheScreen());
  });

  it('reports when sign-up needs email confirmation instead of signing in', async () => {
    mockApi.mockResolvedValue({ ok: true, confirm: true });
    const onResult = jest.fn();
    const user = userEvent.setup();
    await render(<AuthProvider><Probe onResult={onResult} /></AuthProvider>);
    await user.press(await screen.findByText('sign up'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith('confirm'));
    expect(mockAuth.setSession).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- tests/features/auth tests/lib/schemas.test.ts`
Expected: the provider test FAILS (module not found). The schemas test passes once Step 1 exists.

- [ ] **Step 4: Implement the query client and AuthProvider**

```ts
// src/lib/query.ts
import { QueryClient, onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

onlineManager.setEventListener((setOnline) => {
  const subscription = Network.addNetworkStateListener((state) => setOnline(state.isConnected !== false));
  return () => subscription.remove();
});
```

(Check `node_modules/expo-network/build/Network.d.ts`: `addNetworkStateListener` must return an object with `.remove()`. If it doesn't, adapt the code and note it in the report.)

```tsx
// src/features/auth/provider.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { api, ApiError } from '@/lib/api';
import { queryClient } from '@/lib/query';
import type { SignInInput, SignUpInput } from '@/lib/schemas';
import type { Tokens } from '@/lib/types';

type AuthContext = {
  user: User | null;
  ready: boolean;
  signIn: (input: SignInInput) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<'signed-in' | 'confirm'>;
  signOut: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
};
const Context = createContext<AuthContext | null>(null);

/** Hands tokens from the store API to supabase-js, which then stores and refreshes them. */
async function adopt(session: Tokens) {
  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) throw new ApiError('Please sign in again.', 401, 'session_expired');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value: AuthContext = {
    user,
    ready,
    async signIn(input) {
      const { session } = await api<{ session: Tokens }>('/api/auth/sign-in', {
        method: 'POST',
        body: { ...input, client: 'mobile' },
      });
      await adopt(session);
    },
    async signUp(input) {
      const result = await api<{ session?: Tokens; confirm?: boolean }>('/api/auth/sign-up', {
        method: 'POST',
        body: { ...input, client: 'mobile' },
      });
      if (!result.session) return 'confirm';
      await adopt(result.session);
      return 'signed-in';
    },
    async signOut() {
      await supabase.auth.signOut();
      queryClient.removeQueries({ queryKey: ['bag'] });
    },
    async forgotPassword(email) {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email, client: 'mobile' } });
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error('AuthProvider is required');
  return context;
}
```

The provider test imports `@/lib/query`, which imports `expo-network`. If jest-expo does not stub `expo-network`, add `jest.mock('expo-network', () => ({ addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })), useNetworkState: jest.fn(() => ({ isConnected: true, isInternetReachable: true })) }))` to `jest.setup.ts`.

- [ ] **Step 5: Run the provider test to verify it passes**

Run: `npm test -- tests/features/auth/provider.test.tsx`
Expected: PASS (3).

- [ ] **Step 6: Button and Field**

```tsx
// src/components/Button.tsx
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { AppText } from './AppText';
import { colors, fonts } from './theme';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
};

export function Button({ title, onPress, variant = 'primary', loading, disabled, accessibilityLabel }: Props) {
  const inactive = disabled || loading;
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.secondary,
        pressed && primary && { backgroundColor: colors.primaryPressed },
        inactive && styles.inactive,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.elevated : colors.primary} />
      ) : (
        <AppText style={[styles.label, { color: primary ? colors.elevated : colors.primary }]}>{title}</AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 48, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  secondary: { backgroundColor: 'transparent', borderColor: colors.primary },
  inactive: { opacity: 0.5 },
  label: { fontFamily: fonts.bodyBold, fontSize: 15, letterSpacing: 0.3 },
});
```

```tsx
// src/components/Field.tsx
import { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { AppText } from './AppText';
import { colors, fonts } from './theme';

type Props = TextInputProps & { label: string; error?: string; required?: boolean };

export const Field = forwardRef<TextInput, Props>(function Field({ label, error, required, style, ...input }, ref) {
  return (
    <View style={styles.field}>
      <AppText variant="label">
        {label}
        {required ? <AppText style={{ color: colors.destructive }}> *</AppText> : null}
      </AppText>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[styles.input, error ? { borderColor: colors.destructive } : null, style]}
        {...input}
      />
      {error ? (
        <AppText accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  field: { gap: 6 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.foreground,
  },
  error: { color: colors.destructive, fontSize: 13 },
});
```

- [ ] **Step 7: Write the failing sign-in form test**

```tsx
// tests/features/auth/sign-in-form.test.tsx
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

const mockSignIn = jest.fn();
jest.mock('@/features/auth/provider', () => ({ useAuth: () => ({ signIn: mockSignIn }) }));
jest.mock('expo-router', () => ({ router: { dismiss: jest.fn(), push: jest.fn() }, Link: () => null }));

import { ApiError } from '@/lib/api';
import { SignInForm } from '@/features/auth/forms/SignInForm';
import { router } from 'expo-router';

jest.mock('@/lib/supabase', () => ({ supabase: { auth: {} } }));

beforeEach(() => jest.clearAllMocks());

describe('SignInForm', () => {
  it('validates before calling the API', async () => {
    const user = userEvent.setup();
    await render(<SignInForm />);
    await user.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeOnTheScreen();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('shows the server message, keeps the email and clears the password', async () => {
    mockSignIn.mockRejectedValue(new ApiError('Email or password is incorrect.', 401));
    const user = userEvent.setup();
    await render(<SignInForm />);
    await user.type(screen.getByLabelText('Email'), 'tolu@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Email or password is incorrect.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Email').props.value).toBe('tolu@example.com');
    expect(screen.getByLabelText('Password').props.value).toBe('');
  });

  it('closes the modal after signing in', async () => {
    mockSignIn.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await render(<SignInForm />);
    await user.type(screen.getByLabelText('Email'), 'tolu@example.com');
    await user.type(screen.getByLabelText('Password'), 'right-password');
    await user.press(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.dismiss).toHaveBeenCalled());
    expect(mockSignIn).toHaveBeenCalledWith({ email: 'tolu@example.com', password: 'right-password' });
  });
});
```

- [ ] **Step 8: Run it to verify it fails, then implement the three forms**

Run: `npm test -- tests/features/auth/sign-in-form.test.tsx`. Expected: FAIL, module not found.

```tsx
// src/features/auth/forms/SignInForm.tsx
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { colors } from '@/components/theme';
import { useAuth } from '@/features/auth/provider';
import { signInSchema, type SignInInput } from '@/lib/schemas';

export function SignInForm() {
  const { signIn } = useAuth();
  const [serverError, setServerError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { control, handleSubmit, setValue, formState } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });
  const submit = handleSubmit(async (input) => {
    setServerError('');
    try {
      await signIn(input);
      router.dismiss();
    } catch (error) {
      setValue('password', '');
      setServerError(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    }
  });
  return (
    <View style={{ gap: 16 }}>
      {serverError ? (
        <AppText accessibilityRole="alert" style={{ color: colors.destructive }}>
          {serverError}
        </AppText>
      ) : null}
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <Field
            label="Email"
            required
            autoComplete="email"
            keyboardType="email-address"
            autoCapitalize="none"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <Field
            label="Password"
            required
            autoComplete="current-password"
            secureTextEntry={!showPassword}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <Pressable accessibilityRole="button" onPress={() => setShowPassword((s) => !s)}>
        <AppText variant="muted">{showPassword ? 'Hide password' : 'Show password'}</AppText>
      </Pressable>
      <Button title="Sign in" onPress={submit} loading={formState.isSubmitting} />
      <Pressable accessibilityRole="link" onPress={() => router.push('/forgot-password')}>
        <AppText variant="muted">Forgot your password?</AppText>
      </Pressable>
    </View>
  );
}
```

`SignUpForm.tsx` follows the same structure and copy as the web's Create account tab:
- Fields: "First name", "Last name", "Email", "Password" (with the "Use at least 8 characters" hint shown under it), and "Mobile number (optional)" with `keyboardType="phone-pad"`.
- It uses `signUpSchema` and `signUp`.
- A result of `'signed-in'` calls `router.dismiss()`.
- A result of `'confirm'` shows "Check your email to confirm your account, then sign in." in place of the form.
- An `ApiError` with `code === 'account_exists'` shows the server message plus two links, "Sign in" (`router.replace('/sign-in')`) and "Reset password" (`router.replace('/forgot-password')`).
- The password is cleared on error.

`ForgotPasswordForm.tsx` has one "Email" field (`emailOnlySchema`). On submit it calls `forgotPassword`, then always shows "If an account exists for that email, we've sent a link to reset your password. The link opens on the website." (the same answer whether or not the account exists). It shows the server message only on `code === 'network'`.

- [ ] **Step 9: Screens, layout wiring and the Account tab**

```tsx
// src/app/sign-in.tsx  (sign-up.tsx and forgot-password.tsx are identical apart from title/form)
import { ScrollView } from 'react-native';
import { AppText } from '@/components/AppText';
import { SignInForm } from '@/features/auth/forms/SignInForm';

export default function SignInScreen() {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 24 }} keyboardShouldPersistTaps="handled">
      <AppText variant="display">Sign in</AppText>
      <SignInForm />
    </ScrollView>
  );
}
```

In `src/app/_layout.tsx`:
- Wrap the `Stack` in `<QueryClientProvider client={queryClient}><AuthProvider>…</AuthProvider></QueryClientProvider>`.
- Add the screens `<Stack.Screen name="sign-in" options={{ presentation: 'modal', title: '' }} />`, `sign-up` and `forgot-password` with the same options.

`src/app/(tabs)/account.tsx`:
- Signed in: show `AppText variant="display"` "Your account", the name from `user.user_metadata.first_name` / `last_name` (fall back to `full_name`), the email, and a secondary `Button` "Sign out" that calls `signOut`.
- Guest: show "Sign in to keep your bag on all your devices", a primary `Button` "Sign in" (`router.push('/sign-in')`) and a secondary "Create account" (`router.push('/sign-up')`).
- While `!ready`, show an `ActivityIndicator`.

- [ ] **Step 10: Gate and commit**

Run: `npm test`, `npx tsc --noEmit`, `npx expo lint`. Expected: all pass.

```bash
git add -A
git commit -m "feat: sign in, sign up and reset password with the store account"
```

---

### Task 5: Catalogue — Shop tab and product screen

**Files:**
- Create: `src/features/catalogue/queries.ts`, `src/features/catalogue/selection.ts`, `src/features/catalogue/ProductCard.tsx`, `src/features/catalogue/VariantPicker.tsx`, `src/features/catalogue/AudienceFilter.tsx`, `src/components/Price.tsx`, `src/components/ErrorState.tsx`, `src/app/product/[slug].tsx`
- Modify: `src/app/(tabs)/index.tsx`, `src/app/_layout.tsx` (product screen options)
- Test: `tests/features/catalogue/selection.test.ts`, `tests/features/catalogue/variant-picker.test.tsx`

**Interfaces:**
- Consumes: `api`, `ApiError`, the types (Task 3), `assetUrl`, `money` (Task 1).
- Produces:
  - `useCategories()`, `useProducts({ audience?: string; category?: string })` (an infinite query), `useProduct(slug)`.
  - `selection.ts` exports `colourKey`, `variantImage`, `initialSelection`, `selectOption`, `selectedVariant(product, options): Variant | undefined`, `optionKeys(product): string[]`, `isAvailable(product, key, value, selected): boolean`.
  - `VariantPicker({ product, selected, onChoose })`.
  - `Price({ amount, compareAt?, from? })`.
  - `ErrorState({ message, onRetry })`.
- The product screen needs `useBag().add` from Task 6. Until then, render the "Add to bag" button with `onPress={() => {}}` and a `// wired in Task 6` comment, since Task 6 modifies this file.

- [ ] **Step 1: Copy the selection logic and add the helpers**

Copy `features/catalogue/selection.ts` from the web repo (`C:/Users/TEHCDeveloper2/Desktop/VS-CODE-FILES/hng/the-oreva-edit/features/catalogue/selection.ts`) verbatim into `src/features/catalogue/selection.ts`, changing only the type import to `import type { Product, Variant } from '@/lib/types';`. Then append:

```ts
/** Option names in the order the web shows them (e.g. Colour, Size, Length). */
export function optionKeys(product: Product) {
  return [...new Set(product.variants.flatMap((v) => Object.keys(v.attributes)))];
}

export function selectedVariant(product: Product, options: Record<string, string>) {
  const keys = optionKeys(product);
  return product.variants.find((v) => keys.every((k) => v.attributes[k] === options[k]));
}

/** Same rule as the web picker: colours stay browsable; other options must fit the current choice. */
export function isAvailable(product: Product, key: string, value: string, selected: Record<string, string>) {
  const keys = optionKeys(product);
  const colour = colourKey(product);
  return product.variants.some(
    (v) =>
      v.attributes[key] === value &&
      v.stock > 0 &&
      (key === colour ||
        keys.filter((k) => k !== key && selected[k]).every((k) => v.attributes[k] === selected[k])),
  );
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/features/catalogue/selection.test.ts
import { isAvailable, selectOption, selectedVariant, initialSelection } from '@/features/catalogue/selection';
import type { Product } from '@/lib/types';

const v = (id: string, Colour: string, Size: string, stock: number, image: string | null = null) => ({
  id, sku: id, attributes: { Colour, Size }, price: null, stock, image,
});
const product: Product = {
  id: 'p1', name: 'Linen shirt', slug: 'linen-shirt', description: '', short_description: '',
  category: 'Shirts', audience: 'men', status: 'active', price: 2850000, compare_at: null,
  images: ['/images/shirt.jpg'], alt: 'Shirt', details: [], care: '',
  variants: [
    v('a', 'Ecru', 'M', 3, '/images/ecru.jpg'),
    v('b', 'Ecru', 'L', 0),
    v('c', 'Olive', 'M', 2, '/images/olive.jpg'),
  ],
};

describe('selection', () => {
  it('finds the variant once every option is chosen', () => {
    const s = selectOption(product, selectOption(product, initialSelection(product), 'Colour', 'Ecru'), 'Size', 'M');
    expect(selectedVariant(product, s.options)?.id).toBe('a');
  });
  it('marks sold-out sizes unavailable for the chosen colour', () => {
    expect(isAvailable(product, 'Size', 'L', { Colour: 'Ecru' })).toBe(false);
    expect(isAvailable(product, 'Size', 'M', { Colour: 'Ecru' })).toBe(true);
  });
  it('keeps colours browsable and drops an incompatible size', () => {
    const s = selectOption(product, { options: { Colour: 'Ecru', Size: 'M' }, image: '', quantity: 1 }, 'Colour', 'Olive');
    expect(s.options).toEqual({ Colour: 'Olive', Size: 'M' });
    expect(s.image).toBe('/images/olive.jpg');
  });
});
```

```tsx
// tests/features/catalogue/variant-picker.test.tsx
import { render, screen, userEvent } from '@testing-library/react-native';
import { VariantPicker } from '@/features/catalogue/VariantPicker';
import type { Product } from '@/lib/types';

const product = {
  id: 'p1', name: 'Shirt', slug: 'shirt', description: '', short_description: '', category: 'Shirts',
  audience: 'men', status: 'active', price: 1000, compare_at: null, images: [], alt: '', details: [], care: '',
  variants: [
    { id: 'a', sku: 'a', attributes: { Size: 'M' }, price: null, stock: 1 },
    { id: 'b', sku: 'b', attributes: { Size: 'L' }, price: null, stock: 0 },
  ],
} as Product;

it('labels sold-out options and reports a choice', async () => {
  const onChoose = jest.fn();
  const user = userEvent.setup();
  await render(<VariantPicker product={product} selected={{}} onChoose={onChoose} />);
  expect(screen.getByRole('button', { name: 'Size: L (sold out)' })).toBeDisabled();
  await user.press(screen.getByRole('button', { name: 'Size: M' }));
  expect(onChoose).toHaveBeenCalledWith('Size', 'M');
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm test -- tests/features/catalogue`. Expected: FAIL (`VariantPicker` missing; the selection test passes as soon as Step 1 is done, which is fine).

- [ ] **Step 4: Implement queries and components**

```ts
// src/features/catalogue/queries.ts
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Category, Product, ProductSummary } from '@/lib/types';

type Page = { products: ProductSummary[]; page: number; pageSize: number; total: number };

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api<{ categories: Category[] }>('/api/catalogue/categories'),
    select: (data) => data.categories,
    staleTime: 5 * 60_000,
  });
}

export function useProducts(filters: { audience?: string; category?: string }) {
  return useInfiniteQuery({
    queryKey: ['products', filters],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ page: String(pageParam) });
      if (filters.audience) query.set('audience', filters.audience);
      if (filters.category) query.set('category', filters.category);
      return api<Page>(`/api/catalogue/products?${query}`);
    },
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
}

export function useProduct(slug: string) {
  return useQuery({
    queryKey: ['product', slug],
    queryFn: () => api<{ product: Product }>(`/api/catalogue/products/${encodeURIComponent(slug)}`),
    select: (data) => data.product,
  });
}
```

```tsx
// src/features/catalogue/VariantPicker.tsx
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { colors } from '@/components/theme';
import { isAvailable, optionKeys } from './selection';
import type { Product } from '@/lib/types';

type Props = { product: Product; selected: Record<string, string>; onChoose: (key: string, value: string) => void };

export function VariantPicker({ product, selected, onChoose }: Props) {
  return (
    <View style={{ gap: 16 }}>
      {optionKeys(product).map((key) => {
        const values = [...new Set(product.variants.map((v) => v.attributes[key]).filter(Boolean))];
        return (
          <View key={key} style={{ gap: 8 }}>
            <AppText variant="label">
              {key}
              {selected[key] ? ` — ${selected[key]}` : ''}
            </AppText>
            <View style={styles.options}>
              {values.map((value) => {
                const available = isAvailable(product, key, value, selected);
                const chosen = selected[key] === value;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={`${key}: ${value}${available ? '' : ' (sold out)'}`}
                    accessibilityState={{ disabled: !available, selected: chosen }}
                    disabled={!available}
                    onPress={() => onChoose(key, value)}
                    style={[styles.option, chosen && styles.chosen, !available && styles.soldOut]}
                  >
                    <AppText style={{ color: chosen ? colors.elevated : colors.foreground }}>{value}</AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { minWidth: 48, minHeight: 44, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  chosen: { backgroundColor: colors.foreground, borderColor: colors.foreground },
  soldOut: { opacity: 0.4 },
});
```

```tsx
// src/components/Price.tsx
import { AppText } from './AppText';
import { colors } from './theme';
import { money } from '@/lib/money';

export function Price({ amount, compareAt, from }: { amount: number; compareAt?: number | null; from?: boolean }) {
  return (
    <AppText variant="body">
      {from ? 'From ' : ''}
      {money(amount)}
      {compareAt && compareAt > amount ? (
        <AppText style={{ color: colors.muted, textDecorationLine: 'line-through' }}> {money(compareAt)}</AppText>
      ) : null}
    </AppText>
  );
}
```

```tsx
// src/components/ErrorState.tsx
import { View } from 'react-native';
import { AppText } from './AppText';
import { Button } from './Button';

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ padding: 24, gap: 16, alignItems: 'flex-start' }}>
      <AppText>{message}</AppText>
      <Button title="Try again" variant="secondary" onPress={onRetry} />
    </View>
  );
}
```

`ProductCard.tsx`:
- A `Pressable` with `accessibilityRole="button"` and `accessibilityLabel={`${name}, ${money(price)}`}`. On press it calls `router.push({ pathname: '/product/[slug]', params: { slug } })`.
- `expo-image` `Image` with `source={assetUrl(image)}`, `style={{ width: '100%', aspectRatio: 3 / 4 }}`, `contentFit="cover"`, `transition={150}`, `recyclingKey={id}`.
- The name in `AppText`, `<Price amount={price} compareAt={compare_at} />`, and a muted "Sold out" when `!inStock`.

`AudienceFilter.tsx`: a horizontal `ScrollView` of chips. The options are `All` (undefined), `Women` (`women`), `Men` (`men`) and `Kids` (`kids`), plus the top-level categories (`parent_id === null`) from `useCategories()`. Chips use the same chosen/unchosen style as `VariantPicker` and carry `accessibilityState={{ selected }}`. Props: `{ audience, category, onChange(next: { audience?: string; category?: string }) }`. Choosing an audience clears the category and choosing a category keeps the audience.

- [ ] **Step 5: Shop tab and product screen**

`src/app/(tabs)/index.tsx`:
- A `SafeAreaView` with an `AppText variant="display"` "The Oreva Edit" header, then `AudienceFilter`, then a `FlatList` with `numColumns={2}`.
- Data: `data?.pages.flatMap((p) => p.products)`.
- `onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}`, `onEndReachedThreshold={0.5}`.
- `refreshing={isRefetching}` / `onRefresh={refetch}`.
- `ListEmptyComponent`: a spinner while loading, `ErrorState` (error message, `refetch`) on error, otherwise "Nothing here yet".
- `columnWrapperStyle={{ gap: 12 }}` and `contentContainerStyle={{ padding: 16, gap: 16 }}`.

`src/app/product/[slug].tsx`:
- Read `const { slug } = useLocalSearchParams<{ slug: string }>()`, then `useProduct(slug)`.
- While loading show a spinner. On a 404 `ApiError`, show "This piece is no longer available". On any other error, show `ErrorState`.
- Otherwise keep the selection in `useState(() => initialSelection(product))`; when it changes, reset via `selectOption`.
- Render, in a `ScrollView`:
  - an `Image` of `assetUrl(selection.image)`;
  - the name (`variant="title"`);
  - the price: `<Price amount={variant ? variant.price ?? product.price : Math.min(...product.variants.map((x) => x.price ?? product.price))} from={!variant} compareAt={product.compare_at} />`;
  - `short_description`;
  - `<VariantPicker product={product} selected={selection.options} onChoose={(k, val) => setSelection((s) => selectOption(product, s, k, val))} />`;
  - a status line: "Choose your options" until `variant`, then "`<values joined by / >` — available" or "This option is currently sold out.";
  - the "Add to bag" `Button`, `disabled={!variant || variant.stock < 1}` (wired in Task 6);
  - `description`, `details` as bullet lines, and `care`.

In `src/app/_layout.tsx`, add `<Stack.Screen name="product/[slug]" options={{ title: '', headerBackTitle: 'Shop' }} />`.

- [ ] **Step 6: Run the tests, gate and commit**

Run: `npm test`, `npx tsc --noEmit`, `npx expo lint`. Expected: all pass.

```bash
git add -A
git commit -m "feat: browse the catalogue and choose product options"
```

---

### Task 6: The bag — guest and signed-in, with merge

**Files:**
- Create: `src/features/bag/ops.ts`, `src/features/bag/guest.ts`, `src/features/bag/provider.tsx`, `src/components/QuantityStepper.tsx`
- Modify: `src/app/_layout.tsx` (BagProvider inside AuthProvider), `src/app/(tabs)/bag.tsx`, `src/app/(tabs)/_layout.tsx` (badge), `src/app/product/[slug].tsx` (wire Add to bag)
- Test: `tests/features/bag/ops.test.ts`, `tests/features/bag/provider.test.tsx`

**Interfaces:**
- Consumes: `api`, `ApiError`, `BagView`, `BagLine`, `CartLine`, `LineDetail` (Task 3), `cartSchema` (Task 4), `useAuth` (Task 4).
- Produces:
  - `type BagOp = { op: 'add' | 'set'; variantId: string; quantity: number } | { op: 'remove'; variantId: string }`.
  - `applyGuestOp(lines: CartLine[], op: BagOp, stock: number): { lines: CartLine[]; capped: boolean }`.
  - `applyOptimistic(view: BagView, op: BagOp): BagView`.
  - `loadGuestBag(): Promise<CartLine[]>`, `saveGuestBag(lines)`, `clearGuestBag()`.
  - `BagProvider`, and `useBag(): { lines: BagLine[]; count: number; ready: boolean; signedIn: boolean; notice: string; clearNotice(): void; add(variantId: string, quantity: number, stock: number): Promise<boolean>; setQuantity(variantId: string, quantity: number): void; remove(variantId: string): void }`.
  - `bagQueryKey(userId) = ['bag', userId]`, used by Task 7.

- [ ] **Step 1: Write the failing ops test**

```ts
// tests/features/bag/ops.test.ts
import { applyGuestOp, applyOptimistic } from '@/features/bag/ops';
import type { BagView } from '@/lib/types';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';

describe('applyGuestOp', () => {
  it('adds, increments, sets and removes', () => {
    let lines = applyGuestOp([], { op: 'add', variantId: A, quantity: 1 }, 5).lines;
    lines = applyGuestOp(lines, { op: 'add', variantId: A, quantity: 2 }, 5).lines;
    expect(lines).toEqual([{ variantId: A, quantity: 3 }]);
    lines = applyGuestOp(lines, { op: 'set', variantId: A, quantity: 1 }, 5).lines;
    expect(lines).toEqual([{ variantId: A, quantity: 1 }]);
    expect(applyGuestOp(lines, { op: 'remove', variantId: A }, 5).lines).toEqual([]);
  });
  it('caps at stock and at 20, reporting the cap', () => {
    expect(applyGuestOp([], { op: 'add', variantId: A, quantity: 9 }, 4)).toEqual({
      lines: [{ variantId: A, quantity: 4 }],
      capped: true,
    });
    expect(applyGuestOp([{ variantId: A, quantity: 19 }], { op: 'add', variantId: A, quantity: 5 }, 99).lines).toEqual([
      { variantId: A, quantity: 20 },
    ]);
  });
  it('refuses a 51st line', () => {
    const full = Array.from({ length: 50 }, (_, i) => ({
      variantId: `00000000-0000-4000-8000-${String(100 + i).padStart(12, '0')}`,
      quantity: 1,
    }));
    expect(applyGuestOp(full, { op: 'add', variantId: B, quantity: 1 }, 5)).toEqual({ lines: full, capped: true });
  });
});

describe('applyOptimistic', () => {
  const line = (variantId: string, quantity: number, stock = 5) => ({
    variantId,
    quantity,
    product: { id: 'p', slug: 's', name: 'n', image: null, alt: '', price: 100 },
    variant: { attributes: {}, price: null, stock },
  });
  const view: BagView = { lines: [line(A, 2), line(B, 1)], wishlist: [] };
  it('sets and removes known lines immediately', () => {
    expect(applyOptimistic(view, { op: 'set', variantId: A, quantity: 4 }).lines[0].quantity).toBe(4);
    expect(applyOptimistic(view, { op: 'remove', variantId: B }).lines.map((l) => l.variantId)).toEqual([A]);
  });
  it('increments a known line on add and leaves unknown adds to the server', () => {
    expect(applyOptimistic(view, { op: 'add', variantId: A, quantity: 1 }).lines[0].quantity).toBe(3);
    expect(applyOptimistic(view, { op: 'add', variantId: 'other', quantity: 1 })).toEqual(view);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/features/bag/ops.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement ops and guest persistence**

```ts
// src/features/bag/ops.ts
import type { BagView, CartLine } from '@/lib/types';

export type BagOp =
  | { op: 'add' | 'set'; variantId: string; quantity: number }
  | { op: 'remove'; variantId: string };

const limit = (stock: number) => Math.max(0, Math.min(stock, 20));

/** Guest bag rules, matching the server: capped at stock and 20 per line, at most 50 lines. */
export function applyGuestOp(lines: CartLine[], op: BagOp, stock: number) {
  if (op.op === 'remove') return { lines: lines.filter((l) => l.variantId !== op.variantId), capped: false };
  const current = lines.find((l) => l.variantId === op.variantId);
  if (!current && lines.length >= 50) return { lines, capped: true };
  const wanted = op.op === 'add' ? (current?.quantity ?? 0) + op.quantity : op.quantity;
  const quantity = Math.min(wanted, limit(stock));
  const others = lines.filter((l) => l.variantId !== op.variantId);
  const next = quantity > 0 ? (current ? lines.map((l) => (l.variantId === op.variantId ? { ...l, quantity } : l)) : [...others, { variantId: op.variantId, quantity }]) : others;
  return { lines: next, capped: quantity !== wanted };
}

/** What the signed-in bag shows while a change is on its way; new lines wait for the server. */
export function applyOptimistic(view: BagView, op: BagOp): BagView {
  if (op.op === 'remove') return { ...view, lines: view.lines.filter((l) => l.variantId !== op.variantId) };
  if (!view.lines.some((l) => l.variantId === op.variantId)) return view;
  return {
    ...view,
    lines: view.lines.map((l) =>
      l.variantId !== op.variantId
        ? l
        : { ...l, quantity: Math.min(op.op === 'add' ? l.quantity + op.quantity : op.quantity, limit(l.variant.stock)) },
    ),
  };
}
```

```ts
// src/features/bag/guest.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cartSchema } from '@/lib/schemas';
import type { CartLine } from '@/lib/types';

const KEY = 'oreva-bag-v1';

export async function loadGuestBag(): Promise<CartLine[]> {
  try {
    return cartSchema.parse(JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]'));
  } catch {
    return []; // Corrupt storage starts empty.
  }
}
export const saveGuestBag = (lines: CartLine[]) => AsyncStorage.setItem(KEY, JSON.stringify(lines));
export const clearGuestBag = () => AsyncStorage.removeItem(KEY);
```

Run `npm test -- tests/features/bag/ops.test.ts`. Expected: PASS.

- [ ] **Step 4: Write the failing provider test**

```tsx
// tests/features/bag/provider.test.tsx
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/lib/supabase', () => ({ supabase: { auth: {} } }));
const mockApi = jest.fn();
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return { ...actual, api: (...args: unknown[]) => mockApi(...args) };
});
let mockAuthState = { user: null as null | { id: string }, ready: true };
jest.mock('@/features/auth/provider', () => ({ useAuth: () => mockAuthState }));

import { ApiError } from '@/lib/api';
import { BagProvider, useBag } from '@/features/bag/provider';

const A = '00000000-0000-4000-8000-000000000001';
const detail = (quantity: number) => ({
  variantId: A,
  quantity,
  product: { id: 'p', slug: 's', name: 'Shirt', image: null, alt: '', price: 1000 },
  variant: { attributes: { Size: 'M' }, price: null, stock: 5 },
});

function Probe() {
  const bag = useBag();
  return (
    <>
      <Text>{`count:${bag.count}`}</Text>
      <Text>{`notice:${bag.notice}`}</Text>
      <Pressable onPress={() => bag.add(A, 1, 5)}><Text>add</Text></Pressable>
      <Pressable onPress={() => bag.setQuantity(A, 4)}><Text>set4</Text></Pressable>
    </>
  );
}

const renderBag = async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = await render(
    <QueryClientProvider client={client}>
      <BagProvider><Probe /></BagProvider>
    </QueryClientProvider>,
  );
  return { client, view };
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockAuthState = { user: null, ready: true };
});

describe('guest bag', () => {
  it('keeps lines on the device without calling the shopping API', async () => {
    mockApi.mockResolvedValue({ lines: [detail(1)] }); // variants lookup
    const user = userEvent.setup();
    await renderBag();
    await user.press(screen.getByText('add'));
    await waitFor(() => expect(screen.getByText('count:1')).toBeOnTheScreen());
    expect(JSON.parse((await AsyncStorage.getItem('oreva-bag-v1'))!)).toEqual([{ variantId: A, quantity: 1 }]);
    expect(mockApi.mock.calls.some(([path]) => path === '/api/shopping')).toBe(false);
  });
});

describe('signed-in bag', () => {
  beforeEach(() => {
    mockAuthState = { user: { id: 'user-1' }, ready: true };
  });

  it('merges a guest bag once when the customer signs in, then clears it', async () => {
    await AsyncStorage.setItem('oreva-bag-v1', JSON.stringify([{ variantId: A, quantity: 2 }]));
    mockApi.mockImplementation(async (path: string, options?: { method?: string }) =>
      options?.method === 'POST' ? { signedIn: true, userId: 'user-1', lines: [{ variantId: A, quantity: 2 }], wishlist: [] } : { signedIn: true, lines: [detail(2)], wishlist: [] },
    );
    await renderBag();
    await waitFor(() => expect(screen.getByText('count:2')).toBeOnTheScreen());
    const merges = mockApi.mock.calls.filter(([, o]) => o?.method === 'POST');
    expect(merges).toHaveLength(1);
    expect(merges[0]).toEqual(['/api/shopping', { method: 'POST', auth: true, body: { action: 'merge', lines: [{ variantId: A, quantity: 2 }], wishlist: [] } }]);
    expect(await AsyncStorage.getItem('oreva-bag-v1')).toBeNull();
  });

  it('keeps the guest bag when the merge fails', async () => {
    await AsyncStorage.setItem('oreva-bag-v1', JSON.stringify([{ variantId: A, quantity: 2 }]));
    mockApi.mockImplementation(async (_path: string, options?: { method?: string }) => {
      if (options?.method === 'POST') throw new ApiError("Can't reach the store. Check your connection and try again.", 0, 'network');
      return { signedIn: true, lines: [], wishlist: [] };
    });
    await renderBag();
    await waitFor(() => expect(screen.getByText(/notice:Can't reach the store/)).toBeOnTheScreen());
    expect(await AsyncStorage.getItem('oreva-bag-v1')).not.toBeNull();
  });

  it('applies a quantity change at once and keeps the server answer', async () => {
    mockApi.mockImplementation(async (_path: string, options?: { method?: string }) =>
      options?.method === 'PATCH' ? { signedIn: true, lines: [detail(4)], wishlist: [], adjusted: [] } : { signedIn: true, lines: [detail(2)], wishlist: [] },
    );
    const user = userEvent.setup();
    await renderBag();
    await waitFor(() => expect(screen.getByText('count:2')).toBeOnTheScreen());
    await user.press(screen.getByText('set4'));
    expect(screen.getByText('count:4')).toBeOnTheScreen();
    expect(mockApi).toHaveBeenCalledWith('/api/shopping', { method: 'PATCH', auth: true, body: { ops: [{ op: 'set', variantId: A, quantity: 4 }] } });
  });

  it('rolls back and explains a rejected change', async () => {
    mockApi.mockImplementation(async (_path: string, options?: { method?: string }) => {
      if (options?.method === 'PATCH') throw new ApiError('nope', 500);
      return { signedIn: true, lines: [detail(2)], wishlist: [] };
    });
    const user = userEvent.setup();
    await renderBag();
    await waitFor(() => expect(screen.getByText('count:2')).toBeOnTheScreen());
    await user.press(screen.getByText('set4'));
    await waitFor(() => expect(screen.getByText('count:2')).toBeOnTheScreen());
    expect(screen.getByText('notice:Your bag could not be updated. Please try again.')).toBeOnTheScreen();
  });

  it('tells the customer when the server capped a quantity', async () => {
    mockApi.mockImplementation(async (_path: string, options?: { method?: string }) =>
      options?.method === 'PATCH' ? { signedIn: true, lines: [detail(5)], wishlist: [], adjusted: [A] } : { signedIn: true, lines: [detail(2)], wishlist: [] },
    );
    const user = userEvent.setup();
    await renderBag();
    await waitFor(() => expect(screen.getByText('count:2')).toBeOnTheScreen());
    await user.press(screen.getByText('add'));
    await waitFor(() => expect(screen.getByText("notice:Quantity updated to what's in stock")).toBeOnTheScreen());
    await act(async () => {});
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npm test -- tests/features/bag/provider.test.tsx`. Expected: FAIL, module not found.

- [ ] **Step 6: Implement the BagProvider**

```tsx
// src/features/bag/provider.tsx
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
```

Run: `npm test -- tests/features/bag`. Expected: PASS. If a test is wrong against real React Query behaviour (for example, the timing of optimistic updates), fix the test minimally and explain why in the report. Do not weaken what it asserts.

- [ ] **Step 7: QuantityStepper, Bag tab, badge and Add to bag**

```tsx
// src/components/QuantityStepper.tsx
import { Pressable, StyleSheet, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { AppText } from './AppText';
import { colors } from './theme';

export function QuantityStepper({ value, max, onChange, label }: { value: number; max: number; onChange: (next: number) => void; label: string }) {
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Decrease quantity of ${label}`} disabled={value <= 1} onPress={() => onChange(value - 1)} style={[styles.button, value <= 1 && styles.off]}>
        <Minus size={16} color={colors.foreground} />
      </Pressable>
      <AppText accessibilityLabel={`Quantity ${value}`} style={styles.value}>{value}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={`Increase quantity of ${label}`} disabled={value >= max} onPress={() => onChange(value + 1)} style={[styles.button, value >= max && styles.off]}>
        <Plus size={16} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, alignSelf: 'flex-start' },
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.35 },
  value: { minWidth: 32, textAlign: 'center' },
});
```

`src/app/(tabs)/bag.tsx`:
- A `SafeAreaView` with the title "Your bag".
- If `!ready`, show a spinner. If `lines` is empty, show "Your bag is empty", a `Button` "Shop the edit" (`router.navigate('/')`) and, for guests, the muted line "Sign in to keep your bag on all your devices".
- Otherwise show a `FlatList` of rows:
  - the `Image` (`assetUrl(line.product.image)`, 72×96);
  - the name;
  - the attributes joined with " / " (muted);
  - the unit price `money(line.variant.price ?? line.product.price)`;
  - `<QuantityStepper value={line.quantity} max={Math.min(line.variant.stock, 20)} label={line.product.name} onChange={(q) => setQuantity(line.variantId, q)} />`;
  - a "Remove" text button (`accessibilityLabel={`Remove ${line.product.name}`}`).
- Footer: "Subtotal" with `money(sum of unit price × quantity)`, and the muted line "Checkout is coming to the app soon — you can check out on the website."
- When `notice` is set, show it at the top in a bordered note with a close button calling `clearNotice`.

`src/app/(tabs)/_layout.tsx`: read `const { count } = useBag();` and add `<NativeTabs.Trigger.Badge hidden={count === 0}>{String(count)}</NativeTabs.Trigger.Badge>` inside the Bag trigger.

`src/app/product/[slug].tsx`: wire the "Add to bag" button.
- On press: `const ok = await add(variant.id, 1, variant.stock);`.
- If `ok`, show the inline confirmation "Added to your bag" with a "View bag" link (`router.navigate('/bag')`).
- Keep the button `loading` while adding.

`src/app/_layout.tsx`: nest `<BagProvider>` inside `<AuthProvider>`.

- [ ] **Step 8: Gate and commit**

Run: `npm test`, `npx tsc --noEmit`, `npx expo lint`. Expected: all pass.

```bash
git add -A
git commit -m "feat: keep a bag for guests and signed-in customers with sign-in merge"
```

---

### Task 7: Live sync and offline handling

**Files:**
- Create: `src/features/bag/live.ts`, `src/components/NetworkBanner.tsx`
- Modify: `src/features/bag/provider.tsx` (call `useBagLive(userId)`), `src/app/_layout.tsx` (render `NetworkBanner`)
- Test: `tests/features/bag/live.test.tsx`, `tests/components/network-banner.test.tsx`

**Interfaces:**
- Consumes: `supabase` (Task 2), `bagQueryKey` (Task 6), `queryClient` usage via `useQueryClient`.
- Produces: `useBagLive(userId: string | null): void`, `NetworkBanner()`.

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/features/bag/live.test.tsx
import { renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const mockChannel = { on: jest.fn(), subscribe: jest.fn() };
let onEvent: () => void = () => {};
mockChannel.on.mockImplementation((_type: string, _filter: unknown, cb: () => void) => {
  onEvent = cb;
  return mockChannel;
});
mockChannel.subscribe.mockReturnValue(mockChannel);
const mockSupabase = { channel: jest.fn(() => mockChannel), removeChannel: jest.fn() };
jest.mock('@/lib/supabase', () => ({ supabase: mockSupabase }));

import { useBagLive } from '@/features/bag/live';

const setup = async (userId: string | null) => {
  const client = new QueryClient();
  const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = await renderHook(() => useBagLive(userId), { wrapper });
  return { invalidate, hook };
};

beforeEach(() => jest.clearAllMocks());

describe('useBagLive', () => {
  it('subscribes to the customer’s own bag row and refetches on every event', async () => {
    const { invalidate } = await setup('user-1');
    expect(mockSupabase.channel.mock.calls[0][0]).toMatch(/^shopping:user-1:/);
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shopping_state', filter: 'user_id=eq.user-1' },
      expect.any(Function),
    );
    onEvent();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bag', 'user-1'] });
  });

  it('refetches when the app comes back to the foreground', async () => {
    let listener: (state: string) => void = () => {};
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, cb) => {
      listener = cb as (state: string) => void;
      return { remove: jest.fn() };
    });
    const { invalidate } = await setup('user-1');
    listener('active');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bag', 'user-1'] });
  });

  it('does nothing for guests and unsubscribes on sign-out', async () => {
    await setup(null);
    expect(mockSupabase.channel).not.toHaveBeenCalled();
    const { hook } = await setup('user-1');
    await hook.unmount();
    expect(mockSupabase.removeChannel).toHaveBeenCalledWith(mockChannel);
  });
});
```

```tsx
// tests/components/network-banner.test.tsx
import { render, screen } from '@testing-library/react-native';
import { useNetworkState } from 'expo-network';
import { NetworkBanner } from '@/components/NetworkBanner';

jest.mock('expo-network', () => ({ useNetworkState: jest.fn(), addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })) }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ refetchQueries: jest.fn() }) }));

it('shows the offline message only when the phone is offline', async () => {
  (useNetworkState as jest.Mock).mockReturnValue({ isConnected: false, isInternetReachable: false });
  await render(<NetworkBanner />);
  expect(screen.getByText("Can't reach the store. Check your connection and try again.")).toBeOnTheScreen();
  (useNetworkState as jest.Mock).mockReturnValue({ isConnected: true, isInternetReachable: true });
  await render(<NetworkBanner />);
  expect(screen.queryAllByText("Can't reach the store. Check your connection and try again.")).toHaveLength(1);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/features/bag/live.test.tsx tests/components`. Expected: FAIL, modules not found.

- [ ] **Step 3: Implement live sync and the banner**

```ts
// src/features/bag/live.ts
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { bagQueryKey } from './provider';

/**
 * Refetches the bag whenever it changes on any device (Realtime) and when the app returns to
 * the foreground (events missed while backgrounded). Events are signals only; the API is the
 * source of the bag.
 */
export function useBagLive(userId: string | null) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const refetch = () => void queryClient.invalidateQueries({ queryKey: bagQueryKey(userId) });
    // A unique topic per subscription: realtime-js reuses channels by topic, so a fixed name
    // can hand a closing channel to the next subscriber.
    const channel = supabase
      .channel(`shopping:${userId}:${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_state', filter: `user_id=eq.${userId}` }, refetch)
      .subscribe();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetch();
    });
    return () => {
      foreground.remove();
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
```

There is a circular import: `live.ts` imports `bagQueryKey` from `provider.tsx`, and the provider calls `useBagLive`. To avoid it, move `bagQueryKey` into `src/features/bag/keys.ts`. Import it from there in both files and re-export it from `provider.tsx`, so Task 6's interface stays the same.

```tsx
// src/components/NetworkBanner.tsx
import { Pressable, StyleSheet, View } from 'react-native';
import { useNetworkState } from 'expo-network';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { colors } from './theme';

export function NetworkBanner() {
  const { isConnected, isInternetReachable } = useNetworkState();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  if (isConnected !== false && isInternetReachable !== false) return null;
  return (
    <View accessibilityRole="alert" style={[styles.banner, { paddingTop: insets.top + 8 }]}>
      <AppText style={styles.text}>Can't reach the store. Check your connection and try again.</AppText>
      <Pressable accessibilityRole="button" onPress={() => void queryClient.refetchQueries({ type: 'active' })}>
        <AppText style={[styles.text, styles.retry]}>Retry</AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.foreground, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', gap: 12, alignItems: 'center' },
  text: { color: colors.elevated, flexShrink: 1 },
  retry: { textDecorationLine: 'underline' },
});
```

The banner test above renders twice in one test and counts matches, so only one offline message exists. If RNTL v14 auto-cleanup makes that awkward, split it into two tests (offline shows the message; online shows nothing) and say so in the report.

In `BagProvider`, call `useBagLive(userId);` right after `useQueryClient()`. Add `jest.mock('@/features/bag/live', () => ({ useBagLive: jest.fn() }));` to `tests/features/bag/provider.test.tsx` so those tests stay independent of Realtime. In `src/app/_layout.tsx`, render `<NetworkBanner />` above the `Stack`, inside `QueryClientProvider`; it needs `SafeAreaProvider`, which Expo Router provides.

- [ ] **Step 4: Run tests, gate and commit**

Run: `npm test`, `npx tsc --noEmit`, `npx expo lint`. Expected: all pass.

```bash
git add -A
git commit -m "feat: sync the bag live with the website and handle being offline"
```

---

### Task 8: Run on a phone and verify (owner + controller)

**Files:**
- Create: `.env.local` (git-ignored, not committed)
- Modify: `README.md`

The controller and the owner do this task together. Subagents do only Steps 1–2.

- [ ] **Step 1: README**

Replace the template README with:
- What the app is.
- Setup: `npm install`; copy `.env.example` to `.env.local` and fill it in; `npx expo start`; scan the QR code with Expo Go on a phone on the same Wi-Fi, or use `npx expo start --tunnel`.
- Scripts: `npm test`, `npm run typecheck`, `npm run lint`.
- The API it uses: the deployed store, with a link to the spec in the web repo.
- The Phase 2/3 scope note.

Commit as `docs: explain how to run the app`.

- [ ] **Step 2: Final gate**

Run: `npm test && npx tsc --noEmit && npx expo lint && npx expo-doctor`. Expected: all pass. Report any `expo-doctor` warnings; don't silence them.

- [ ] **Step 3: Environment (controller)**

Create `.env.local`:
- `EXPO_PUBLIC_API_URL=https://the-oreva-edit.vercel.app`.
- Take `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the web repo's `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (production values).
- Never copy `SUPABASE_SECRET_KEY`.

Confirm with the owner that the production project has the Realtime migration applied (`shopping_state` is listed in `supabase_realtime`).

- [ ] **Step 4: Phone verification (owner, with the controller watching the logs)**

Run `npx expo start` and open the app in Expo Go on an Android or iOS phone. Then:

1. Create an account on the phone. Sign in with it on the website in a desktop browser.
2. On the website, add a product variant. The phone's Bag tab badge and list update within about 2 seconds, without touching the phone.
3. On the phone, change that line's quantity. The website's bag updates within about 2 seconds.
4. Remove the line on the website; it disappears on the phone.
5. Sign out on the phone, add an item as a guest, then sign in. The guest item joins the account bag and appears on the website.
6. Background the app, add an item on the website, then reopen the app. The item is there.
7. Turn on airplane mode. The banner appears and a quantity change rolls back with the message. Turn airplane mode off and tap Retry; it recovers.

Record a short screen capture of steps 2 and 3 as the brief's evidence.
