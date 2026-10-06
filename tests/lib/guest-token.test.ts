
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async (n: number) => Uint8Array.from({ length: n }, (_, i) => i)),
}));

// jest.resetModules gives each test a fresh SecureStore mock, so read the store after the reset.
const store = () => (require('expo-secure-store') as { __store: Map<string, string> }).__store;
const load = () => require('@/lib/guest-token') as typeof import('@/lib/guest-token');

beforeEach(() => {
  jest.resetModules();
});

describe('getGuestToken', () => {
  it('creates a 64-hex token once and keeps it in SecureStore', async () => {
    const { getGuestToken } = load();
    const [a, b] = await Promise.all([getGuestToken(), getGuestToken()]);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toBe(a);
    expect(store().get('oreva-guest-token')).toBe(a);
    expect(require('expo-crypto').getRandomBytesAsync).toHaveBeenCalledTimes(1);
  });

  it('reuses the stored token after a restart', async () => {
    store().set('oreva-guest-token', 'ab'.repeat(32));
    expect(await load().getGuestToken()).toBe('ab'.repeat(32));
  });

  it('replaces a malformed stored value', async () => {
    store().set('oreva-guest-token', 'nope');
    expect(await load().getGuestToken()).toMatch(/^[0-9a-f]{64}$/);
  });
});
