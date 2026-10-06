import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type Status = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';
type MockChannel = {
  topic: string;
  on: jest.Mock;
  subscribe: jest.Mock;
  onEvent: () => void;
  onStatus: (status: Status) => void;
};
// A fresh channel per call, as realtime-js hands out one per topic.
const mockChannels: MockChannel[] = [];
const mockSupabase = {
  channel: jest.fn((topic: string) => {
    const channel: MockChannel = {
      topic,
      on: jest.fn((_type: string, _filter: unknown, cb: () => void) => {
        channel.onEvent = cb;
        return channel;
      }),
      subscribe: jest.fn((cb?: (status: Status) => void) => {
        channel.onStatus = cb ?? (() => {});
        return channel;
      }),
      onEvent: () => {},
      onStatus: () => {},
    };
    mockChannels.push(channel);
    return channel;
  }),
  removeChannel: jest.fn(async () => 'ok'),
};
jest.mock('@/lib/supabase', () => ({
  get supabase() {
    return mockSupabase;
  },
}));

import { useBagLive } from '@/features/bag/live';

// gcTime: Infinity keeps React Query from leaving garbage-collection timers behind.
const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } } });
const spies: jest.SpyInstance[] = [];
const setup = async (userId: string | null, client = newClient()) => {
  const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue();
  spies.push(invalidate);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = await renderHook(() => useBagLive(userId), { wrapper });
  return { invalidate, hook, client };
};
const latest = () => mockChannels[mockChannels.length - 1];
// The react-native preset already mocks AppState.addEventListener; read the hook's listener
// from its calls rather than spying (a spy on a mock shares it, and restoring would break it).
const appStateListener = () => {
  const calls = jest.mocked(AppState.addEventListener).mock.calls;
  return calls[calls.length - 1][1] as (state: string) => void;
};

beforeEach(() => {
  mockChannels.length = 0;
  jest.clearAllMocks();
});
afterEach(() => {
  // Restore only these spies: restoreAllMocks would also strip the module mocks' implementations.
  spies.splice(0).forEach((spy) => spy.mockRestore());
  jest.useRealTimers();
});

describe('useBagLive', () => {
  it('subscribes to the customer’s own bag row and refetches on every event', async () => {
    const { invalidate } = await setup('user-1');
    expect(mockSupabase.channel).toHaveBeenCalledTimes(1);
    expect(latest().topic).toMatch(/^shopping:user-1:/);
    expect(latest().on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shopping_state', filter: 'user_id=eq.user-1' },
      expect.any(Function),
    );
    latest().onEvent();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bag', 'user-1'] });
  });

  it('subscribes afresh and refetches when the app comes back to the foreground', async () => {
    const { invalidate } = await setup('user-1');
    const first = latest();
    const listener = appStateListener();
    listener('background');
    expect(mockSupabase.channel).toHaveBeenCalledTimes(1);
    listener('active');
    expect(mockSupabase.channel).toHaveBeenCalledTimes(2);
    expect(latest().topic).toMatch(/^shopping:user-1:/);
    expect(latest().topic).not.toBe(first.topic);
    expect(mockSupabase.removeChannel).toHaveBeenCalledWith(first);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bag', 'user-1'] });
    // The new channel still drives refetches.
    invalidate.mockClear();
    latest().onEvent();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bag', 'user-1'] });
  });

  it('subscribes again shortly after the channel fails, once per failure burst', async () => {
    jest.useFakeTimers();
    const { invalidate } = await setup('user-1');
    const first = latest();
    await act(async () => {
      first.onStatus('CHANNEL_ERROR');
      first.onStatus('TIMED_OUT');
    });
    expect(mockSupabase.channel).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(mockSupabase.channel).toHaveBeenCalledTimes(2);
    expect(latest().topic).not.toBe(first.topic);
    expect(mockSupabase.removeChannel).toHaveBeenCalledWith(first);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bag', 'user-1'] });
    // The replaced channel closing is expected and does not trigger another subscription.
    await act(async () => {
      first.onStatus('CLOSED');
      jest.advanceTimersByTime(2000);
    });
    expect(mockSupabase.channel).toHaveBeenCalledTimes(2);
  });

  it('subscribes again when the live channel closes', async () => {
    jest.useFakeTimers();
    await setup('user-1');
    await act(async () => {
      latest().onStatus('SUBSCRIBED');
      jest.advanceTimersByTime(2000);
    });
    expect(mockSupabase.channel).toHaveBeenCalledTimes(1);
    await act(async () => {
      latest().onStatus('CLOSED');
      jest.advanceTimersByTime(2000);
    });
    expect(mockSupabase.channel).toHaveBeenCalledTimes(2);
  });

  it('does not refetch while a bag change is pending', async () => {
    const client = newClient();
    const pending = client
      .getMutationCache()
      .build(client, { mutationKey: ['bag-change'], mutationFn: () => new Promise<never>(() => {}) })
      .execute(undefined);
    pending.catch(() => {});
    const { invalidate } = await setup('user-1', client);
    latest().onEvent();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('does nothing for guests and unsubscribes on sign-out', async () => {
    await setup(null);
    expect(mockSupabase.channel).not.toHaveBeenCalled();
    const { hook } = await setup('user-1');
    const channel = latest();
    await hook.unmount();
    expect(mockSupabase.removeChannel).toHaveBeenCalledWith(channel);
  });

  it('drops a pending re-subscription on sign-out', async () => {
    jest.useFakeTimers();
    const { hook } = await setup('user-1');
    const channel = latest();
    await act(async () => {
      channel.onStatus('CHANNEL_ERROR');
    });
    await hook.unmount();
    expect(mockSupabase.removeChannel).toHaveBeenCalledWith(channel);
    // The channel closing as it is removed must not start a new one either.
    channel.onStatus('CLOSED');
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockSupabase.channel).toHaveBeenCalledTimes(1);
  });
});
