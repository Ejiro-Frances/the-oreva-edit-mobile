import { renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const mockChannel = { on: jest.fn(), subscribe: jest.fn() };
let onEvent: () => void = () => {};
mockChannel.on.mockImplementation((_type: string, _filter: unknown, cb: () => void) => {
  onEvent = cb;
  return mockChannel;
});
mockChannel.subscribe.mockReturnValue(mockChannel);
const mockSupabase = { channel: jest.fn((_topic: string) => mockChannel), removeChannel: jest.fn() };
jest.mock('@/lib/supabase', () => ({
  get supabase() {
    return mockSupabase;
  },
}));

import { useBagLive } from '@/features/bag/live';

const setup = async (userId: string | null, client = new QueryClient()) => {
  const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = await renderHook(() => useBagLive(userId), { wrapper });
  return { invalidate, hook, client };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockChannel.on.mockImplementation((_type: string, _filter: unknown, cb: () => void) => {
    onEvent = cb;
    return mockChannel;
  });
  mockChannel.subscribe.mockReturnValue(mockChannel);
  mockSupabase.channel.mockImplementation((_topic: string) => mockChannel);
});

describe('useBagLive', () => {
  it('subscribes to the customer’s own bag row and refetches on every event', async () => {
    const { invalidate } = await setup('user-1');
    expect(mockSupabase.channel.mock.calls[0][0]).toMatch(/^shopping:user-1:/);
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shopping_state', filter: 'user_id=eq.user-1' },
      expect.any(Function),
    );
    onEvent();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bag', 'user-1'] });
  });

  it('refetches when the app comes back to the foreground', async () => {
    let listener: (state: string) => void = () => {};
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, cb) => {
      listener = cb as (state: string) => void;
      return { remove: jest.fn() };
    });
    const { invalidate } = await setup('user-1');
    listener('active');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bag', 'user-1'] });
  });

  it('does not refetch while a bag change is pending', async () => {
    const client = new QueryClient();
    const pending = client
      .getMutationCache()
      .build(client, { mutationKey: ['bag-change'], mutationFn: () => new Promise<never>(() => {}) })
      .execute(undefined);
    pending.catch(() => {});
    const { invalidate } = await setup('user-1', client);
    onEvent();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('does nothing for guests and unsubscribes on sign-out', async () => {
    await setup(null);
    expect(mockSupabase.channel).not.toHaveBeenCalled();
    const { hook } = await setup('user-1');
    await hook.unmount();
    expect(mockSupabase.removeChannel).toHaveBeenCalledWith(mockChannel);
  });
});
