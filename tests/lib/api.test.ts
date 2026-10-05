jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      refreshSession: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));
jest.mock('@/lib/config', () => ({ apiUrl: 'https://store.test' }));

import { api, ApiError } from '@/lib/api';

const mockAuth = jest.requireMock('@/lib/supabase').supabase.auth;

const json = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response);
let fetchMock: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock = jest.fn();
  (globalThis as any).fetch = fetchMock as unknown as typeof fetch;
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
