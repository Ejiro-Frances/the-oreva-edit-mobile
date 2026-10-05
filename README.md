# The Oreva Edit Mobile

Mobile shopping app built with Expo SDK 57. Customers sign in with their store account, browse the catalogue, pick product variants, and keep a shopping bag that syncs live with the website at https://the-oreva-edit.vercel.app.

## Setup

Install dependencies:

```bash
npm install
```

Create a `.env.local` file from the template:

```bash
cp .env.example .env.local
```

Fill in the variables:
- `EXPO_PUBLIC_API_URL`: The deployed store URL (https://the-oreva-edit.vercel.app)
- `EXPO_PUBLIC_SUPABASE_URL`: From the web repo's `NEXT_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: From the web repo's `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Start the app:

```bash
npx expo start
```

Open in Expo Go on a phone:
- Same Wi-Fi: Scan the QR code in the terminal
- Different network: Use `npx expo start --tunnel` and scan the tunnel QR code

## Scripts

- `npm start`: Start the development server
- `npm run android`: Start with Android emulator
- `npm run ios`: Start with iOS simulator
- `npm test`: Run tests with Jest
- `npm run typecheck`: Type-check with TypeScript
- `npm run lint`: Lint with ESLint

## API & Design

The app connects to the store backend. See the full design specification in the web repo: [2026-10-05-mobile-app-cart-sync-design.md](https://github.com/Ejiro-Frances/the-oreva-edit/blob/main/docs/superpowers/specs/2026-10-05-mobile-app-cart-sync-design.md).

## Roadmap

**Phase 1 (current):** Sign in, browse catalogue, manage bag with live website sync.

**Phase 2 (future):** Wishlist, order history, in-app checkout.

**Phase 3 (future):** Google Sign-In integration.
