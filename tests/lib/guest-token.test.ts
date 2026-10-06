jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async (n: number) => Uint8Array.from({ length: n }, (_, i) => i)),
}));

// jest.resetModules gives each test fresh mocks, so read them after the reset.
type SecureStoreMock = typeof import('expo-secure-store') & { __store: Map<string, string> };
const secureStore = () => require('expo-secure-store') as SecureStoreMock;
const store = () => secureStore().__store;
const crypto = () => require('expo-crypto') as { getRandomBytesAsync: jest.Mock };
const load = () => require('@/lib/guest-token') as typeof import('@/lib/guest-token');

beforeEach(() => {
  jest.resetModules();
});

describe('getGuestToken', () => {
  it('creates a 64-hex token once and keeps it in SecureStore after first unlock', async () => {
    const { getGuestToken } = load();
    const [a, b] = await Promise.all([getGuestToken(), getGuestToken()]);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toBe(a);
    expect(store().get('oreva-guest-token')).toBe(a);
    expect(crypto().getRandomBytesAsync).toHaveBeenCalledTimes(1);
    const options = { keychainAccessible: secureStore().AFTER_FIRST_UNLOCK };
    expect(secureStore().getItemAsync).toHaveBeenCalledWith('oreva-guest-token', options);
    expect(secureStore().setItemAsync).toHaveBeenCalledWith('oreva-guest-token', a, options);
  });

  it('reuses the stored token after a restart', async () => {
    store().set('oreva-guest-token', 'ab'.repeat(32));
    expect(await load().getGuestToken()).toBe('ab'.repeat(32));
  });

  it('replaces a malformed stored value', async () => {
    store().set('oreva-guest-token', 'nope');
    expect(await load().getGuestToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('creates and stores a fresh token when the keychain cannot be read', async () => {
    store().set('oreva-guest-token', 'ab'.repeat(32));
    jest.mocked(secureStore().getItemAsync).mockRejectedValueOnce(new Error('decryption failed'));
    const token = await load().getGuestToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(token).not.toBe('ab'.repeat(32));
    expect(store().get('oreva-guest-token')).toBe(token);
  });

  it('still returns the fresh token for this session when it cannot be stored', async () => {
    jest.mocked(secureStore().getItemAsync).mockRejectedValueOnce(new Error('decryption failed'));
    jest.mocked(secureStore().setItemAsync).mockRejectedValueOnce(new Error('keychain locked'));
    const { getGuestToken } = load();
    const token = await getGuestToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await getGuestToken()).toBe(token);
  });

  it('tries again on the next call after a failed creation', async () => {
    crypto().getRandomBytesAsync.mockRejectedValueOnce(new Error('no entropy'));
    const { getGuestToken } = load();
    await expect(getGuestToken()).rejects.toThrow('no entropy');
    expect(await getGuestToken()).toMatch(/^[0-9a-f]{64}$/);
    expect(crypto().getRandomBytesAsync).toHaveBeenCalledTimes(2);
  });
});
