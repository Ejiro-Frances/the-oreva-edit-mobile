// Only the literal `process.env.EXPO_PUBLIC_*` form is inlined by Expo; do not destructure.
export const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/** The API returns site-relative image paths; the app needs absolute URLs. */
export function assetUrl(path?: string | null) {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : `${apiUrl}${path}`;
}
