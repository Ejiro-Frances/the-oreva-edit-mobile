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
