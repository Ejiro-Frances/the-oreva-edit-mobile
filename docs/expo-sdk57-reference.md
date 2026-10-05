# Expo SDK 57 API reference (verified for this project)

Project: `the-oreva-edit-mobile` - expo ~57.0.26, expo-router 57.0.24, RN 0.86.3, React 19.2.3, supabase-js 2.117.2, RNTL 14.0.1, jest-expo 57.0.5.
Source tags: [docs] = fetched from docs.expo.dev / supabase.com / tanstack.com; [nm] = read in this project's node_modules (ground truth for installed versions).
Items marked (own design) are recommendations, not copied from docs.

## 0. What the template already does

- `src/app/_layout.tsx`: single root layout rendering `<ThemeProvider>` (imported from `expo-router`) + `<AnimatedSplashOverlay/>` + `<AppTabs/>`. Calls `SplashScreen.preventAutoHideAsync()` at module scope.
- `src/components/app-tabs.tsx` (native): `NativeTabs` from `expo-router/unstable-native-tabs`, triggers `index` and `explore` with `src={require('@/assets/images/tabIcons/*.png')}`.
- `src/components/app-tabs.web.tsx` (web): custom tabs from `expo-router/ui` (`Tabs, TabList, TabTrigger, TabSlot`), triggers `name="home" href="/"` and `explore`, "Expo Starter" brand text. Metro picks `.web.tsx` on web, so if tabs move into a `(tabs)` group this file must be updated or deleted too.
- Routes `src/app/index.tsx`, `src/app/explore.tsx` are flat (no `(tabs)` group yet).
- `tsconfig.json` extends `expo/tsconfig.base`, strict, paths `@/*` -> `./src/*`, `@/assets/*` -> `./assets/*`, includes `.expo/types/**/*.ts` and `expo-env.d.ts`.
- app.json plugins: `expo-router`, `expo-splash-screen`, `expo-secure-store`, `expo-image`. experiments: typedRoutes + reactCompiler.
- Already in package.json: react-query, supabase-js, react-native-url-polyfill, async-storage 2.2.0, secure-store, expo-image, expo-font, both Google font packages, lucide-react-native, react-native-svg 15.15.4, jest 29.7 + jest-expo + RNTL 14.
- NOT installed: `expo-network`, `@react-native-community/netinfo`, `expo-sqlite`, `@types/jest`, `eslint`, `eslint-config-expo`, `aes-js`, `react-native-get-random-values`. `test-renderer` is not a declared dependency (1.3.0 is present in node_modules, undeclared).

## 1. Expo Router (57.0.24)

### 1.1 Which tabs API
- Native tabs import path in SDK 54-57 is `expo-router/unstable-native-tabs` (becomes `expo-router/native-tabs` in SDK 58+). [docs https://docs.expo.dev/router/advanced/native-tabs/] [nm expo-router/unstable-native-tabs.d.ts -> `export * from './build/native-tabs'`]
- `Tabs` exported from bare `expo-router` is DEPRECATED: "Use `import { Tabs } from 'expo-router/js-tabs'` instead". [nm expo-router/build/exports.d.ts] `expo-router/ui` is the headless TabList/TabTrigger/TabSlot API (used by the web template file).
- Decision for Shop/Bag/Account: use `NativeTabs`. Gotcha: `NativeTabs.Trigger.Badge` children is typed `string` only (`children?: string; hidden?: boolean; selectedBackgroundColor?`), so pass `String(count)` and use `hidden` for 0. [nm build/native-tabs/common/elements.d.ts]
- Icon props: `sf` (SF Symbol name or `{default, selected}`), `md` (Material symbol, `AndroidSymbol` from expo-symbols), `src` (image/ReactElement + `renderingMode` 'template'|'original'), `xcasset`, `drawable`, `selectedColor`. Allowed combos: sf+md, sf+src, md+src, etc. `NativeTabs.Trigger.VectorIcon` also exists. [nm elements.d.ts, NativeTabTrigger.d.ts]
- Lucide icons cannot be used directly as native tab icons (native bar needs sf/md/src/VectorIcon). Use `sf`+`md` for tabs; Lucide is fine inside screens.
- NativeTabs props the template uses: `backgroundColor`, `indicatorColor`, `labelStyle`; also `badgeBackgroundColor`, `badgeTextColor` (android/web), `hidden`, `tabBarRespectsIMEInsets`. [nm build/native-tabs/types.d.ts]

### 1.2 Target layout
```
src/app/_layout.tsx            Stack root (fonts, providers, splash)
src/app/(tabs)/_layout.tsx     NativeTabs
src/app/(tabs)/index.tsx       Shop
src/app/(tabs)/bag.tsx
src/app/(tabs)/account.tsx
src/app/product/[slug].tsx     pushed on root Stack
src/app/sign-in.tsx            modal
```
Trigger `name` is the route file name inside that layout's directory (`index`, `bag`, `account`), not the group name.

### 1.3 Root Stack with (tabs) group + modal
```tsx
// src/app/_layout.tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="product/[slug]" options={{ title: '' }} />
      <Stack.Screen name="sign-in" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
```
Modal behaviour: Android slides on top and dismisses with back; iOS slides from bottom, swipe-down dismisses; web needs manual dismiss using `router.canGoBack()`. `presentation: 'formSheet'` + `sheetAllowedDetents` for sheets (Android max 3 detents). For deep links into a modal inside a nested stack export `unstable_settings = { anchor: '(tabs)' }`. [docs https://docs.expo.dev/router/advanced/modals/]
The template's `reset-project` script itself writes `import { Stack } from "expo-router"; export default function RootLayout() { return <Stack />; }`. [nm scripts/reset-project.js]

### 1.4 Three tabs with numeric badge (native)
```tsx
// src/app/(tabs)/_layout.tsx
import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function TabsLayout() {
  const bagCount = 3; // from cart state
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Shop</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'bag', selected: 'bag.fill' }} md="storefront" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="bag">
        <NativeTabs.Trigger.Label>Bag</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="handbag.fill" md="shopping_bag" />
        <NativeTabs.Trigger.Badge hidden={bagCount === 0}>{String(bagCount)}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.fill" md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
```
`sf` is typed by `sf-symbols-typescript`, `md` by `AndroidSymbol`; a wrong name is a type error, so confirm with tsc. Docs example: `Trigger.Icon sf="house.fill" md="home"`, `Trigger.Badge>3<`. [docs native-tabs page]

### 1.5 Web tabs file
`app-tabs.web.tsx` uses `expo-router/ui` `TabTrigger name href`. For three tabs: `<TabTrigger name="index" href="/" />`, `name="bag" href="/bag"`, `name="account" href="/account"`. Rewrite or delete depending on whether web is a target (app.json `web.output: static`).

### 1.6 Dynamic route and params
```tsx
// src/app/product/[slug].tsx
import { useLocalSearchParams } from 'expo-router';

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return null;
}
```
[docs https://docs.expo.dev/router/reference/url-parameters/] Typed alternative: `useLocalSearchParams<'/product/[slug]'>()`; query params typed as a second generic. [docs typed-routes] Use `useLocalSearchParams`, not `useGlobalSearchParams`. Catch-all params can be `string[]`.

### 1.7 Imperative navigation
`router` / `useRouter()` methods [nm build/global-state/router.d.ts]: `push(href, options?)`, `navigate`, `replace`, `back()`, `canGoBack()`, `dismiss(count?)`, `dismissTo(href)`, `dismissAll()`, `canDismiss()`, `setParams`, `reload`, `prefetch`.
```tsx
import { router } from 'expo-router';
router.push({ pathname: '/product/[slug]', params: { slug: 'silk-slip-dress' } });
router.push('/product/silk-slip-dress'); // concrete string form also valid
router.back();
router.dismiss(); // closes current modal/stack screen; if it is the only route, dismisses the whole stack
```
After sign-in in a modal use `router.dismiss()` (or `router.dismissTo('/')`).

### 1.8 Typed routes implications
- `experiments.typedRoutes: true` generates `.expo/types` and `expo-env.d.ts` when `npx expo start` runs. In this repo neither exists yet (both gitignored), so `tsc` sees no typed hrefs until the dev server has run once. [docs https://docs.expo.dev/router/reference/typed-routes/]
- `href`/`router.push` strings must match an existing route file or it is a TS error. Dynamic routes should use the object form `{ pathname: '/product/[slug]', params: { slug } }`; the literal string `'/user/[id]'` is a type error. Relative paths unsupported. [docs typed-routes]
- Group names are not in the URL: `(tabs)/bag.tsx` => href `/bag`. After adding/renaming routes, let the dev server regenerate types before running `tsc`.

## 2. Environment variables

- `.env` at project root with `EXPO_PUBLIC_SUPABASE_URL=...`; Expo CLI loads `EXPO_PUBLIC_*` automatically (no dotenv install). [docs https://docs.expo.dev/guides/environment-variables/]
- Inlining is static text replacement: only the exact form `process.env.EXPO_PUBLIC_X` works. `process.env['EXPO_PUBLIC_X']` and `const { EXPO_PUBLIC_X } = process.env` are NOT inlined. [docs]
- Values are visible in the bundle - never a service-role/secret key.
- Edits need a full app reload (CLI restart not required); if stale, `npx expo start -c`. [docs]
- Expo Go: yes, Metro on the dev server inlines them like any build.
- Do not switch `.env` files via `NODE_ENV`; use `.env.local` / EAS env. [docs]
- Template `.gitignore` ignores only `.env*.local`, NOT `.env`. So `.env` would be committed: use `.env.local` or add `.env` to `.gitignore` and commit `.env.example`. [nm .gitignore]
- Optional typing: augment `NodeJS.ProcessEnv` in a `.d.ts` (own design).

## 3. expo-secure-store ~57.0.4

API [nm expo-secure-store/build/SecureStore.d.ts]:
```ts
import * as SecureStore from 'expo-secure-store';
await SecureStore.setItemAsync(key, value, options?);   // Promise<void>
await SecureStore.getItemAsync(key, options?);          // Promise<string | null>
await SecureStore.deleteItemAsync(key, options?);       // Promise<void>
SecureStore.setItem / getItem                           // sync variants
await SecureStore.isAvailableAsync();                   // Promise<boolean>
SecureStore.canUseBiometricAuthentication();            // boolean
```
- Keys: alphanumeric, `.`, `-`, `_` only. Supabase's default key `sb-<ref>-auth-token` is valid. [docs https://docs.expo.dev/versions/v57.0.0/sdk/securestore/]
- Size: "Large payloads can be rejected by the underlying platform. Historically, some iOS releases refused values above roughly 2048 bytes." supabase-js JSDoc says SecureStore does not support values larger than 2048 bytes. A Supabase session JSON (JWT + refresh token + user) usually exceeds that, so do not pass SecureStore directly as `auth.storage`.
- `SecureStoreOptions`: `keychainService` (iOS service / Android alias; reuse it to read back), `keychainAccessible` (iOS; default `WHEN_UNLOCKED`; use `AFTER_FIRST_UNLOCK` so background refresh works, or `*_THIS_DEVICE_ONLY` to block backup migration), `requireAuthentication` (biometric gate; leave off for a session), `authenticationPrompt`, `accessGroup` (iOS).
- Android deletes data on uninstall; iOS keychain survives reinstall (same bundle id) so clear stale session on first launch if desired (own design).
- Works in Expo Go; plugin already in app.json.
- Two options for a Supabase session:
  1. Official: `LargeSecureStore` - AES-256 key in SecureStore, ciphertext in AsyncStorage; needs `aes-js` + `react-native-get-random-values` (not installed). [docs https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native; nm supabase-js/dist/index.cjs l.520-560]
  2. (own design, no new deps) chunked adapter, <=1800 chars per entry:
```ts
import * as SecureStore from 'expo-secure-store';
const CHUNK = 1800;
const opts = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
export const secureStorage = {
  async getItem(key: string) {
    const n = Number(await SecureStore.getItemAsync(`${key}.count`, opts));
    if (!n) return null;
    const parts = await Promise.all(Array.from({ length: n }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`, opts)));
    return parts.some((p) => p == null) ? null : parts.join('');
  },
  async setItem(key: string, value: string) {
    const parts = value.match(new RegExp(`.{1,${CHUNK}}`, 'gs')) ?? [];
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${key}.${i}`, p, opts)));
    await SecureStore.setItemAsync(`${key}.count`, String(parts.length), opts); // count written last
  },
  async removeItem(key: string) {
    const n = Number(await SecureStore.getItemAsync(`${key}.count`, opts)) || 0;
    await Promise.all(Array.from({ length: n }, (_, i) => SecureStore.deleteItemAsync(`${key}.${i}`, opts)));
    await SecureStore.deleteItemAsync(`${key}.count`, opts);
  },
};
```
  Caveat: if the new value has fewer chunks than the old one, stale `.n` entries linger; harmless (count governs) but remove them if tidy.

## 4. Supabase on React Native (supabase-js 2.117.2)

### 4.1 createClient
```ts
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import { secureStorage } from './secure-storage';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, // publishable key only
  { auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } },
);
```
Options verified [nm @supabase/auth-js/dist/main/lib/types.d.ts]: `storage`, `autoRefreshToken`, `persistSession`, `detectSessionInUrl` (boolean | function). The Supabase guide now calls the second argument the "publishable key". `lock` is deprecated (removed in v3) - do not pass the old RN `processLock`. Default `flowType` is "implicit" (nm index.cjs l.36); use `flowType: 'pkce'` only for OAuth/magic-link deep links.

### 4.2 react-native-url-polyfill
- Supabase JSDoc/quickstart still say `import 'react-native-url-polyfill/auto'`, but in an Expo app it should not be needed: Expo's runtime installs spec-compliant global `URL`/`URLSearchParams` (from `whatwg-url-minimum`) on native. [nm expo/src/winter/runtime.native.ts l.21,23; expo/src/winter/url.ts]. RN's own `URL` (react-native/Libraries/Blob/URL.js) is the weak one the polyfill existed to fix.
- auth-js/postgrest-js use `new URL()` and `new URLSearchParams(obj)`. The package is installed and harmless; safe choice is to keep `import 'react-native-url-polyfill/auto'` as line 1 of supabase.ts, or omit it. NOT verified on a device - confirm with one sign-in and one `.from().select()` in Expo Go.
- supabase-js README: RN supported "with fetch polyfills provided by the framework". [nm @supabase/supabase-js/README.md l.204]

### 4.3 AppState auto-refresh
```ts
import { AppState } from 'react-native';
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
```
Verbatim pattern from [docs https://docs.expo.dev/guides/using-supabase/]; methods exist in [nm GoTrueClient.d.ts]. Put at module scope in supabase.ts, or in a root effect and `return () => sub.remove()`. Also call `startAutoRefresh()` once at launch.

### 4.4 setSession
```ts
const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
```
Takes `{access_token, refresh_token}`; refreshes if the access token is expired; persists via the storage adapter and emits auth events. [nm GoTrueClient.d.ts l.1719-1842] For authorization decisions prefer `getClaims()` (used in Supabase's RN quickstart) or `getUser()` over raw `getSession()`.

### 4.5 Realtime postgres_changes
```ts
const channel = supabase
  .channel('bag-sync')
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'bag_items', filter: `user_id=eq.${userId}` },
      (payload) => { /* invalidate bag query */ })
  .subscribe((status) => { /* 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED' */ });
// cleanup
supabase.removeChannel(channel);
```
- RN provides a global `WebSocket`; realtime-js picks it up (`typeof WebSocket !== 'undefined'`). [nm @supabase/realtime-js/dist/main/lib/websocket-factory.js l.14-19]
- Realtime auth is wired automatically: supabase-js calls `realtime.setAuth(token)` on `INITIAL_SESSION`/`SIGNED_IN`/`TOKEN_REFRESHED` and `realtime.setAuth()` on `SIGNED_OUT`. [nm supabase-js/dist/index.cjs l.865-879] `setSession` triggers SIGNED_IN, so no manual call is needed. Manual `await supabase.realtime.setAuth(jwt)` (`setAuth(token?: string | null): Promise<void>`, nm RealtimeClient.d.ts l.282) is only for tokens minted outside supabase.auth.
- General Supabase facts not re-fetched here: table must be in the `supabase_realtime` publication; RLS applies; DELETE payloads carry only the PK unless REPLICA IDENTITY FULL; one filter per subscription.
- Remove channels on unmount; on return to `active` refetch queries rather than trust the socket.

## 5. Fonts and splash

Names verified in [nm @expo-google-fonts/*]:
- Manrope: `Manrope_200ExtraLight, _300Light, _400Regular, _500Medium, _600SemiBold, _700Bold, _800ExtraBold`
- Cormorant Garamond: `CormorantGaramond_{300Light,400Regular,500Medium,600SemiBold,700Bold}` and each with `_Italic` suffix.
- Each package exports `useFonts(map): [boolean, Error | null]` (same as expo-font) plus the assets. The map key IS the `fontFamily` string. Use the specific family per weight; do not rely on `fontWeight` with custom fonts.
```tsx
// src/app/_layout.tsx
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, CormorantGaramond_400Regular, CormorantGaramond_600SemiBold } from '@expo-google-fonts/cormorant-garamond';
import { Manrope_400Regular, Manrope_600SemiBold } from '@expo-google-fonts/manrope';

SplashScreen.preventAutoHideAsync(); // module scope, before first render

export default function RootLayout() {
  const [loaded, error] = useFonts({
    CormorantGaramond_400Regular, CormorantGaramond_600SemiBold,
    Manrope_400Regular, Manrope_600SemiBold,
  });
  useEffect(() => { if (loaded || error) SplashScreen.hideAsync(); }, [loaded, error]);
  if (!loaded && !error) return null;
  return <Stack />;
}
// usage: style={{ fontFamily: 'CormorantGaramond_600SemiBold' }}
```
- Pattern per [docs https://docs.expo.dev/develop/user-interface/fonts/]: the useFonts hook works in Expo Go and web; the `expo-font` config plugin (embedding local files) does NOT work in Expo Go. Variable fonts are SDK 58+.
- Splash: `preventAutoHideAsync()` at global scope, `hideAsync()`/`hide()` when ready, `setOptions({duration, fade})` for fade. SDK 57 note: Expo Go/dev builds cannot fully reproduce the production splash. [docs https://docs.expo.dev/versions/v57.0.0/sdk/splash-screen/]
- The template already calls `preventAutoHideAsync()` and renders `<AnimatedSplashOverlay/>` (src/components/animated-icon.tsx); decide to keep or remove, since it competes with hide-after-fonts.
- Import splash from `expo-splash-screen`; the `SplashScreen` re-exported by `expo-router` is `@hidden`. [nm exports.d.ts]

## 6. expo-image ~57.0.5
```tsx
import { Image } from 'expo-image';
<Image
  source={{ uri: product.imageUrl }}        // plain string also accepted
  style={{ width: '100%', aspectRatio: 3 / 4 }}  // needs explicit size
  contentFit="cover"                         // 'cover'|'contain'|'fill'|'none'|'scale-down'
  placeholder={{ blurhash: product.blurhash }}   // or thumbhash / string / ImageSource
  placeholderContentFit="cover"
  transition={200}                           // ms, or { duration, effect: 'cross-dissolve', timing }
  cachePolicy="memory-disk"                  // 'none'|'disk'|'memory'|'memory-disk'
  recyclingKey={product.id}                  // use in list cells
  priority="normal"                          // 'low'|'normal'|'high'
  accessibilityLabel={product.name}          // or alt
/>
```
Types verified [nm expo-image/build/Image.types.d.ts]: `contentFit`, `placeholder`, `placeholderContentFit`, `transition?: ImageTransition | number | null`, `cachePolicy`, `recyclingKey`, `priority`. Docs https://docs.expo.dev/versions/v57.0.0/sdk/image/. Statics: `Image.prefetch`, `Image.clearDiskCache`. Works in Expo Go.

## 7. Testing

### 7.1 jest-expo
- Docs: `npx expo install jest-expo jest @types/jest --dev`; `"scripts": {"test": "jest --watchAll"}`, `"jest": {"preset": "jest-expo"}`. [docs https://docs.expo.dev/develop/unit-testing/]
- Project state: jest ~29.7.0 and jest-expo ~57.0.5 sit in `dependencies` (move to devDependencies); there is NO `jest` config and NO `test` script. `@types/jest` is missing, so `describe/it/expect` would fail `tsc` (tsconfig includes all `**/*.tsx`); install it or import from `@jest/globals`.
- jest-expo peer-depends on `@react-native/jest-preset ^0.86.3` - installed 0.86.3. [nm jest-expo/package.json]
- `transformIgnorePatterns` already set by the preset: `'/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation))'`. [nm jest-expo/jest-preset.js l.113] `react-native-svg`, `react-native-reanimated`, `expo-*`, `@expo-google-fonts` match. lucide-react-native, @supabase/*, @tanstack/* ship CJS; no override needed. Only append a package name if a dependency ships untransformed ESM.
- Suggested config:
```json
"scripts": { "test": "jest" },
"jest": {
  "preset": "jest-expo",
  "setupFiles": ["<rootDir>/jest.setup.ts"],
  "moduleNameMapper": { "^@/assets/(.*)$": "<rootDir>/assets/$1", "^@/(.*)$": "<rootDir>/src/$1" }
}
```
  Jest does not read tsconfig `paths`, hence the mapper (assets alias first). Whether jest-expo's `src/preset/withTypescriptMapping.js` already covers this was not verified.

### 7.2 @testing-library/react-native 14.0.1 - ASYNC API
v14 requires React 19+, RN 0.78+, Node ^22.13 || >=24. `render`, `renderHook`, `fireEvent`, `act` are ALL async (return Promises) - always `await`. Uses `test-renderer` instead of react-test-renderer. [nm @testing-library/react-native/docs/guides/migration-v14.md; dist/*.d.ts]
- Declare `test-renderer` as a devDependency matching React 19.2: `npm i -D test-renderer@1.2` (peer `^1.0.0`; docs recommend 1.2 for React 19.2; node_modules currently holds an undeclared 1.3.0). `react-test-renderer` / `@types/react-test-renderer` are not needed.
- Matchers register automatically when importing the package (`dist/index.d.ts` imports `./matchers/extend-expect`); no manual extend-expect. Auto cleanup after each test.
- Exports [nm dist/pure.d.ts]: `render, screen, fireEvent (.press .changeText .scroll), userEvent, waitFor, waitForElementToBeRemoved, within, act, cleanup, renderHook, configure`.
```tsx
import { render, screen, userEvent, fireEvent, waitFor } from '@testing-library/react-native';

test('adds to bag', async () => {
  const user = userEvent.setup();
  await render(<ProductScreen />, { wrapper: Providers });   // wrapper option
  await user.press(screen.getByRole('button', { name: 'Add to bag' }));
  expect(await screen.findByText('1 item')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Remove'));          // fireEvent is awaited too
  await waitFor(() => expect(screen.queryByText('1 item')).not.toBeOnTheScreen());
});
```
`userEvent`: `setup, press, longPress, type, clear, paste, scrollTo` (all Promise-returning). Element args are `TestInstance` (test-renderer). Prefer userEvent over fireEvent. Wrap with `QueryClientProvider` using `retry: false`. Full docs offline in `node_modules/@testing-library/react-native/docs` (api/, guides/llm-guidelines.md).

### 7.3 Mocking storage
- AsyncStorage - official mock [nm @react-native-async-storage/async-storage/jest/async-storage-mock]:
```ts
// jest.setup.ts
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
```
- expo-secure-store - NO official in-memory mock. jest-expo only stubs the native module `ExpoSecureStore` with empty `jest.fn()`s (reads return undefined, writes vanish). [nm jest-expo/src/preset/moduleMocks/expoModules.js l.691, l.1421] Write your own:
```ts
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK: 0, WHEN_UNLOCKED: 5,
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => { store.set(k, v); }),
    deleteItemAsync: jest.fn(async (k: string) => { store.delete(k); }),
  };
});
```
- For component tests mock `@/lib/supabase` at the module boundary.

## 8. TanStack Query v5 (5.104.1) on React Native

Works out of the box; wire focus and online managers. [docs https://tanstack.com/query/v5/docs/framework/react/react-native]
```ts
// src/lib/query.ts
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';

export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 2 } } });

AppState.addEventListener('change', (status: AppStateStatus) => {
  if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
});

onlineManager.setEventListener((setOnline) => {
  const sub = Network.addNetworkStateListener((s) => setOnline(!!s.isConnected));
  return () => sub.remove();
});
Network.getNetworkStateAsync().then((s) => onlineManager.setOnline(!!s.isConnected)); // seed initial state
```
The docs mention `getNetworkStateAsync` for initial state with the expo-network integration; the snippet above is my assembly of the documented pattern (verify `addNetworkStateListener` returns a subscription with `.remove()` in `node_modules/expo-network/build` after install). Use `isConnected` as the online flag. Screen-focus refetch: `useFocusEffect` (expo-router) skipping first mount, then `queryClient.refetchQueries({ stale: true, type: 'active' })`. Both `expo-network ~57.0.2` and `@react-native-community/netinfo 12.0.1` are in SDK 57 `bundledNativeModules.json`, i.e. both are available in Expo Go [nm expo/bundledNativeModules.json]; prefer expo-network: `npx expo install expo-network`.

## 9. Offline detection

`expo-network` ~57.0.2 (Android, iOS, tvOS, web, Expo Go): `useNetworkState()`, `getNetworkStateAsync()`, `addNetworkStateListener(cb)`, `getIpAddressAsync()`, `isAirplaneModeEnabledAsync()` (Android). `NetworkState`: `{ type, isConnected, isInternetReachable }`. Config plugin adds ACCESS_NETWORK_STATE/ACCESS_WIFI_STATE automatically. [docs https://docs.expo.dev/versions/v57.0.0/sdk/network/]
```tsx
import { useNetworkState } from 'expo-network';
const { isConnected, isInternetReachable } = useNetworkState();
const offline = isConnected === false || isInternetReachable === false;
```
Not installed yet. Alternative: `@react-native-community/netinfo` 12.0.1.

## 10. lucide-react-native 1.52.0

- Peer deps: `react-native-svg ^12 || ^13 || ^14 || ^15`, React 16-19. [nm lucide-react-native/package.json] react-native-svg 15.15.4 is the SDK 57 bundled version, so it works in Expo Go with no native step.
- Import: `import { ShoppingBag, Store, User, X, House } from 'lucide-react-native';` (names verified in the installed types). Props: `size`, `color`, `strokeWidth`, `absoluteStrokeWidth`, plus SVG props. `<ShoppingBag size={22} color={c} strokeWidth={1.5} />`.
- v1 is a major bump over 0.x with some renames (e.g. `Home` -> `House`); check names in `node_modules/lucide-react-native/dist/types/lucide-react-native.d.ts`. Not usable as a NativeTabs icon (see 1.1).
- Not run on device in this research (no runtime test).

## 11. Template boilerplate and reset-project

- `npm run reset-project` -> `node ./scripts/reset-project.js`. Prompts "move existing files to /example instead of deleting them? (Y/n)". Y (default): creates `/example` and MOVES `src` and `scripts` into it; N: DELETES `src` and `scripts`. Then writes fresh `src/app/index.tsx` (a centered Text) and `src/app/_layout.tsx` (`<Stack />`). Does NOT touch `assets/`, `package.json` (the script entry stays), `app.json`, `README.md`. `.gitignore` already contains `example`. [nm scripts/reset-project.js]
- Do NOT run it now: it would move all of `src/` (components, constants/theme.ts, hooks, global.css). Delete manually instead.
- Remove/replace manually (check imports first): `src/app/explore.tsx`, `src/app/index.tsx` (starter screen), `src/components/{animated-icon.tsx, animated-icon.web.tsx, animated-icon.module.css, hint-row.tsx, web-badge.tsx, external-link.tsx, ui/collapsible.tsx}`, the "Expo Starter" brand and Docs link in `app-tabs.web.tsx`, `assets/images/tabIcons/*`, `assets/expo.icon`, app.json icon/splash/adaptive colours (`#208AEF`, `#E6F4FE`), README body, `scripts/reset-project.js` and the `reset-project` script.
- `src/constants/theme.ts` imports `@/global.css` and `animated-icon.web.tsx` imports a `.module.css` - the two current tsc errors (section 12). `react-dom` and `react-native-web` are for the web target; keep if web matters.

## 12. Lint and typecheck out of the box

- `npx expo lint` (package.json has `"lint": "expo lint"`): NO `eslint.config.js`, and neither `eslint` nor `eslint-config-expo` is installed. First run auto-installs ESLint packages and creates a flat `eslint.config.js` extending `eslint-config-expo`; run again to lint. [docs https://docs.expo.dev/guides/using-eslint/] It needs network and modifies package.json/lockfile (not run here: read-only task). Generated config shape:
```js
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
module.exports = defineConfig([expoConfig, { ignores: ['dist/*'] }]);
```
  Bundled version: `eslint-config-expo ~57.0.2` [nm expo/bundledNativeModules.json]. Deterministic install: `npx expo install eslint eslint-config-expo --dev`.
- `npx tsc --noEmit` (I ran it): exactly 2 errors, both from missing generated types:
  - `src/components/animated-icon.web.tsx(5,21): TS2307 Cannot find module './animated-icon.module.css'`
  - `src/constants/theme.ts(6,8): TS2882 side-effect import of '@/global.css'`
  They vanish once `npx expo start` has generated `expo-env.d.ts` / `.expo/types`, or once the CSS-importing boilerplate is deleted. Typed routes only take effect after that generation, so run `npx expo start` once (or `npx expo customize tsconfig.json`) before relying on `tsc` for href checking, and in CI.
