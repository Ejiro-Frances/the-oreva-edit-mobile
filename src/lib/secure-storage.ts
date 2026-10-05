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
