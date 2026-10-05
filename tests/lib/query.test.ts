import { onlineManager } from '@tanstack/react-query';

jest.mock('expo-network', () => ({ addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })) }));

import { queryClient } from '@/lib/query';

const offline = new Error("Can't reach the store. Check your connection and try again.");

beforeEach(() => onlineManager.setOnline(false));
afterEach(() => {
  queryClient.clear();
  onlineManager.setOnline(true);
});

// gcTime: Infinity keeps React Query from leaving garbage-collection timers behind.
describe('queryClient offline', () => {
  it('fails a query at once instead of pausing it', async () => {
    await expect(
      queryClient.fetchQuery({ queryKey: ['offline'], queryFn: () => Promise.reject(offline), retry: false, gcTime: Infinity }),
    ).rejects.toBe(offline);
  });

  it('fails a mutation at once instead of pausing it', async () => {
    const mutation = queryClient
      .getMutationCache()
      .build(queryClient, { mutationFn: () => Promise.reject(offline), gcTime: Infinity });
    await expect(mutation.execute(undefined)).rejects.toBe(offline);
    expect(mutation.state.isPaused).toBe(false);
  });
});
