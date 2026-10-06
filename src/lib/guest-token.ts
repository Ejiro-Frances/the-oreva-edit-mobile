import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const KEY = 'oreva-guest-token';
const VALID = /^[0-9a-f]{64}$/;
const options = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
let pending: Promise<string> | null = null;

/**
 * This install's guest identity for its server-side bag: 256 random bits kept in the keychain.
 * Concurrent first calls share one creation, so every request uses the same bag.
 * A keychain that cannot be read (e.g. an Android decryption failure) counts as no token; if the
 * new one cannot be stored either, it still serves this session and is recreated next launch.
 */
export function getGuestToken() {
  pending ??= (async () => {
    const stored = await SecureStore.getItemAsync(KEY, options).catch(() => null);
    if (stored && VALID.test(stored)) return stored;
    const bytes = await Crypto.getRandomBytesAsync(32);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync(KEY, token, options).catch(() => undefined);
    return token;
  })().catch((error) => {
    pending = null;
    throw error;
  });
  return pending;
}
