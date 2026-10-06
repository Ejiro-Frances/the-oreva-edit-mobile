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
