import { useState } from 'react';
import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/lib/supabase', () => ({ supabase: { auth: {} } }));
const mockApi = jest.fn();
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return { ...actual, api: (...args: unknown[]) => mockApi(...args) };
});
jest.mock('@/features/bag/live', () => ({ useBagLive: jest.fn() }));
let mockAuthState = { user: null as null | { id: string }, ready: true };
jest.mock('@/features/auth/provider', () => ({ useAuth: () => mockAuthState }));

import { ApiError } from '@/lib/api';
import { BagProvider, useBag } from '@/features/bag/provider';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const detail = (quantity: number, variantId = A) => ({
  variantId,
  quantity,
  product: { id: 'p', slug: 's', name: 'Shirt', image: null, alt: '', price: 1000 },
  variant: { attributes: { Size: 'M' }, price: null, stock: 5 },
});
const offline = () => new ApiError("Can't reach the store. Check your connection and try again.", 0, 'network');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
type Call = [string, { method?: string } | undefined];
const calls = () => mockApi.mock.calls as Call[];
const gets = () => calls().filter(([path, o]) => path === '/api/shopping' && !o?.method).length;
const posts = () => calls().filter(([, o]) => o?.method === 'POST');
// React Query hands updates to observers on a timer, so wait a macrotask, not just microtasks.
const flush = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
const cachedCount = (client: QueryClient) =>
  client.getQueryData<{ lines: { quantity: number }[] }>(['bag', 'user-1'])?.lines.reduce((n, l) => n + l.quantity, 0);

function Probe() {
  const bag = useBag();
  const [result, setResult] = useState('');
  return (
    <>
      <Text>{`count:${bag.count}`}</Text>
      <Text>{`notice:${bag.notice}`}</Text>
      <Text>{`ready:${bag.ready}`}</Text>
      <Text>{`error:${bag.error?.message ?? ''}`}</Text>
      <Text>{`result:${result}`}</Text>
      <Pressable onPress={async () => setResult(String(await bag.add(A, 1, 5)))}><Text>add</Text></Pressable>
      <Pressable onPress={() => bag.add(B, 1, 5)}><Text>addB</Text></Pressable>
      <Pressable
        onPress={() => {
          void bag.add(A, 1, 5);
          void bag.add(A, 1, 5);
        }}
      >
        <Text>add2</Text>
      </Pressable>
      <Pressable onPress={() => bag.setQuantity(A, 4)}><Text>set4</Text></Pressable>
      <Pressable onPress={() => bag.setQuantity(A, 3)}><Text>set3</Text></Pressable>
      <Pressable onPress={bag.retry}><Text>retry</Text></Pressable>
    </>
  );
}

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
const tree = (client: QueryClient) => (
  <QueryClientProvider client={client}>
    <BagProvider><Probe /></BagProvider>
  </QueryClientProvider>
);
const renderBag = async () => {
  const client = newClient();
  const view = await render(tree(client));
  return { client, view };
};

beforeEach(async () => {
  jest.clearAllMocks();
  mockApi.mockReset();
  await AsyncStorage.clear();
  mockAuthState = { user: null, ready: true };
});

describe('guest bag', () => {
  it('keeps lines on the device without calling the shopping API', async () => {
    mockApi.mockResolvedValue({ lines: [detail(1)] }); // variants lookup
    const user = userEvent.setup();
    await renderBag();
    await user.press(screen.getByText('add'));
    await waitFor(() => expect(screen.getByText('count:1')).toBeOnTheScreen());
    expect(JSON.parse((await AsyncStorage.getItem('oreva-bag-v1'))!)).toEqual([{ variantId: A, quantity: 1 }]);
    expect(mockApi.mock.calls.some(([path]) => path === '/api/shopping')).toBe(false);
    expect(screen.getByText('result:true')).toBeOnTheScreen();
  });

  it('composes two adds made in the same moment', async () => {
    mockApi.mockResolvedValue({ lines: [detail(2)] });
    const user = userEvent.setup();
    await renderBag();
    await user.press(screen.getByText('add2'));
    await waitFor(() => expect(screen.getByText('count:2')).toBeOnTheScreen());
    expect(JSON.parse((await AsyncStorage.getItem('oreva-bag-v1'))!)).toEqual([{ variantId: A, quantity: 2 }]);
  });

  it('reports nothing added when the line is already at stock', async () => {
    await AsyncStorage.setItem('oreva-bag-v1', JSON.stringify([{ variantId: A, quantity: 5 }]));
    mockApi.mockResolvedValue({ lines: [detail(5)] });
    const user = userEvent.setup();
    await renderBag();
    await waitFor(() => expect(screen.getByText('count:5')).toBeOnTheScreen());
    await user.press(screen.getByText('add'));
    await waitFor(() => expect(screen.getByText('result:false')).toBeOnTheScreen());
    expect(screen.getByText("notice:Quantity updated to what's in stock")).toBeOnTheScreen();
    expect(JSON.parse((await AsyncStorage.getItem('oreva-bag-v1'))!)).toEqual([{ variantId: A, quantity: 5 }]);
  });

  it('reports nothing added when the bag already holds 50 lines', async () => {
    const full = Array.from({ length: 50 }, (_, i) => ({
      variantId: `00000000-0000-4000-8000-${String(100 + i).padStart(12, '0')}`,
      quantity: 1,
    }));
    await AsyncStorage.setItem('oreva-bag-v1', JSON.stringify(full));
    mockApi.mockResolvedValue({ lines: [] });
    const user = userEvent.setup();
    await renderBag();
    await waitFor(() => expect(screen.getByText('ready:true')).toBeOnTheScreen());
    await user.press(screen.getByText('add'));
    await waitFor(() => expect(screen.getByText('result:false')).toBeOnTheScreen());
    expect(JSON.parse((await AsyncStorage.getItem('oreva-bag-v1'))!)).toHaveLength(50);
  });

  it('is not ready, rather than empty, while line details load', async () => {
    await AsyncStorage.setItem('oreva-bag-v1', JSON.stringify([{ variantId: A, quantity: 1 }]));
    const variants = deferred<unknown>();
    mockApi.mockReturnValue(variants.promise);
    await renderBag();
    await flush();
    expect(screen.getByText('ready:false')).toBeOnTheScreen();
    await act(async () => variants.resolve({ lines: [detail(1)] }));
    await waitFor(() => expect(screen.getByText('ready:true')).toBeOnTheScreen());
    expect(screen.getByText('count:1')).toBeOnTheScreen();
  });

  it('keeps the count while details for a new line load', async () => {
    await AsyncStorage.setItem('oreva-bag-v1', JSON.stringify([{ variantId: A, quantity: 1 }]));
    mockApi.mockResolvedValueOnce({ lines: [detail(1)] });
    const user = userEvent.setup();
    await renderBag();
    await waitFor(() => expect(screen.getByText('count:1')).toBeOnTheScreen());
    const variants = deferred<unknown>();
    mockApi.mockReturnValue(variants.promise);
    await user.press(screen.getByText('addB'));
    await flush();
    expect(screen.getByText('count:1')).toBeOnTheScreen();
    expect(screen.getByText('ready:true')).toBeOnTheScreen();
    await act(async () => variants.resolve({ lines: [detail(1), detail(1, B)] }));
    await waitFor(() => expect(screen.getByText('count:2')).toBeOnTheScreen());
  });

  it('shows an error, not an empty bag, when details fail, and retries', async () => {
    await AsyncStorage.setItem('oreva-bag-v1', JSON.stringify([{ variantId: A, quantity: 1 }]));
    mockApi.mockRejectedValueOnce(offline()).mockResolvedValue({ lines: [detail(1)] });
    const user = userEvent.setup();
    await renderBag();
    await waitFor(() => expect(screen.getByText(/error:Can't reach the store/)).toBeOnTheScreen());
    expect(screen.getByText('ready:true')).toBeOnTheScreen();
    await user.press(screen.getByText('retry'));
    await waitFor(() => expect(screen.getByText('count:1')).toBeOnTheScreen());
    expect(screen.getByText('error:')).toBeOnTheScreen();
  });
});

describe('signed-in bag', () => {
  beforeEach(() => {
    mockAuthState = { user: { id: 'user-1' }, ready: true };
  });

  it('merges a guest bag once when the customer signs in, then clears it', async () => {
    await AsyncStorage.setItem('oreva-bag-v1', JSON.stringify([{ variantId: A, quantity: 2 }]));
    mockApi.mockImplementation(async (path: string, options?: { method?: string }) =>
      options?.method === 'POST' ? { signedIn: true, userId: 'user-1', lines: [{ variantId: A, quantity: 2 }], wishlist: [] } : { signedIn: true, lines: [detail(2)], wishlist: [] },
    );
    await renderBag();
    await waitFor(() => expect(screen.getByText('count:2')).toBeOnTheScreen());
    const merges = mockApi.mock.calls.filter(([, o]) => o?.method === 'POST');
    expect(merges).toHaveLength(1);
    expect(merges[0]).toEqual(['/api/shopping', { method: 'POST', auth: true, body: { action: 'merge', lines: [{ variantId: A, quantity: 2 }], wishlist: [] } }]);
    expect(await AsyncStorage.getItem('oreva-bag-v1')).toBeNull();
  });

  it('posts the merge once when the provider remounts while it is in flight', async () => {
    await AsyncStorage.setItem('oreva-bag-v1', JSON.stringify([{ variantId: A, quantity: 2 }]));
    const merge = deferred<unknown>();
    mockApi.mockImplementation((_path: string, options?: { method?: string }) =>
      options?.method === 'POST' ? merge.promise : Promise.resolve({ signedIn: true, lines: [detail(2)], wishlist: [] }),
    );
    const { client, view } = await renderBag();
    await waitFor(() => expect(posts()).toHaveLength(1));
    await view.unmount();
    await render(tree(client));
    await flush();
    await act(async () => merge.resolve({ signedIn: true, lines: [], wishlist: [] }));
    await waitFor(() => expect(screen.getByText('ready:true')).toBeOnTheScreen());
    expect(posts()).toHaveLength(1);
    expect(await AsyncStorage.getItem('oreva-bag-v1')).toBeNull();
  });

  it('keeps the guest bag when the merge fails', async () => {
    await AsyncStorage.setItem('oreva-bag-v1', JSON.stringify([{ variantId: A, quantity: 2 }]));
    mockApi.mockImplementation(async (_path: string, options?: { method?: string }) => {
      if (options?.method === 'POST') throw offline();
      return { signedIn: true, lines: [], wishlist: [] };
    });
    await renderBag();
    await waitFor(() => expect(screen.getByText(/notice:Can't reach the store/)).toBeOnTheScreen());
    expect(await AsyncStorage.getItem('oreva-bag-v1')).not.toBeNull();
  });

  it('shows an error, not an empty bag, when the bag cannot be loaded, and retries', async () => {
    mockApi.mockRejectedValueOnce(offline()).mockResolvedValue({ signedIn: true, lines: [detail(2)], wishlist: [] });
    const user = userEvent.setup();
    await renderBag();
    await waitFor(() => expect(screen.getByText(/error:Can't reach the store/)).toBeOnTheScreen());
    await user.press(screen.getByText('retry'));
    await waitFor(() => expect(screen.getByText('count:2')).toBeOnTheScreen());
    expect(screen.getByText('error:')).toBeOnTheScreen();
  });

  it('applies a quantity change at once and keeps the server answer', async () => {
    // The server answers GET with whatever the last PATCH left behind.
    let server = [detail(2)];
    mockApi.mockImplementation(async (_path: string, options?: { method?: string }) => {
      if (options?.method === 'PATCH') {
        server = [detail(4)];
        return { signedIn: true, lines: server, wishlist: [], adjusted: [] };
      }
      return { signedIn: true, lines: server, wishlist: [] };
    });
    const user = userEvent.setup();
    await renderBag();
    await waitFor(() => expect(screen.getByText('count:2')).toBeOnTheScreen());
    await user.press(screen.getByText('set4'));
    expect(screen.getByText('count:4')).toBeOnTheScreen();
    expect(mockApi).toHaveBeenCalledWith('/api/shopping', { method: 'PATCH', auth: true, body: { ops: [{ op: 'set', variantId: A, quantity: 4 }] } });
  });

  it('rolls back and explains a rejected change', async () => {
    mockApi.mockImplementation(async (_path: string, options?: { method?: string }) => {
      if (options?.method === 'PATCH') throw new ApiError('nope', 500);
      return { signedIn: true, lines: [detail(2)], wishlist: [] };
    });
    const user = userEvent.setup();
    await renderBag();
    await waitFor(() => expect(screen.getByText('count:2')).toBeOnTheScreen());
    await user.press(screen.getByText('set4'));
    await waitFor(() => expect(screen.getByText('count:2')).toBeOnTheScreen());
    expect(screen.getByText('notice:Your bag could not be updated. Please try again.')).toBeOnTheScreen();
  });

  it('reports a failed add as nothing added', async () => {
    mockApi.mockImplementation(async (_path: string, options?: { method?: string }) => {
      if (options?.method === 'PATCH') throw offline();
      return { signedIn: true, lines: [detail(2)], wishlist: [] };
    });
    const user = userEvent.setup();
    await renderBag();
    await waitFor(() => expect(screen.getByText('count:2')).toBeOnTheScreen());
    await user.press(screen.getByText('add'));
    await waitFor(() => expect(screen.getByText('result:false')).toBeOnTheScreen());
    expect(screen.getByText(/notice:Can't reach the store/)).toBeOnTheScreen();
  });

  it('tells the customer when the server capped a quantity', async () => {
    let server = [detail(2)];
    mockApi.mockImplementation(async (_path: string, options?: { method?: string }) => {
      if (options?.method === 'PATCH') {
        server = [detail(5)];
        return { signedIn: true, lines: server, wishlist: [], adjusted: [A] };
      }
      return { signedIn: true, lines: server, wishlist: [] };
    });
    const user = userEvent.setup();
    await renderBag();
    await waitFor(() => expect(screen.getByText('count:2')).toBeOnTheScreen());
    await user.press(screen.getByText('add'));
    await waitFor(() => expect(screen.getByText("notice:Quantity updated to what's in stock")).toBeOnTheScreen());
    await act(async () => {});
  });

  it('reports nothing added when the server capped an add at what the bag held', async () => {
    mockApi.mockImplementation(async (_path: string, options?: { method?: string }) =>
      options?.method === 'PATCH'
        ? { signedIn: true, lines: [detail(5)], wishlist: [], adjusted: [A] }
        : { signedIn: true, lines: [detail(5)], wishlist: [] },
    );
    const user = userEvent.setup();
    await renderBag();
    await waitFor(() => expect(screen.getByText('count:5')).toBeOnTheScreen());
    await user.press(screen.getByText('add'));
    await waitFor(() => expect(screen.getByText('result:false')).toBeOnTheScreen());
    expect(screen.getByText("notice:Quantity updated to what's in stock")).toBeOnTheScreen();
  });

  it('does not let a bag read that lands during a change overwrite it', async () => {
    let server = [detail(2)];
    const patch = deferred<unknown>();
    mockApi.mockImplementation((_path: string, options?: { method?: string }) =>
      options?.method === 'PATCH' ? patch.promise : Promise.resolve({ signedIn: true, lines: server, wishlist: [] }),
    );
    const user = userEvent.setup();
    const { client } = await renderBag();
    await waitFor(() => expect(screen.getByText('count:2')).toBeOnTheScreen());
    await user.press(screen.getByText('set4'));
    await waitFor(() => expect(screen.getByText('count:4')).toBeOnTheScreen());
    // e.g. a reconnect or a Realtime nudge refetches while the PATCH is still out
    await act(() => client.invalidateQueries({ queryKey: ['bag', 'user-1'] }));
    expect(cachedCount(client)).toBe(4);
    await flush();
    expect(screen.getByText('count:4')).toBeOnTheScreen();
    server = [detail(4)];
    await act(async () => patch.resolve({ signedIn: true, lines: server, wishlist: [], adjusted: [] }));
    await waitFor(() => expect(screen.getByText('count:4')).toBeOnTheScreen());
  });

  it('refetches the bag exactly once after the last change settles', async () => {
    let server = [detail(2)];
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const patches = [first.promise, second.promise];
    mockApi.mockImplementation((_path: string, options?: { method?: string }) =>
      options?.method === 'PATCH' ? patches.shift()! : Promise.resolve({ signedIn: true, lines: server, wishlist: [] }),
    );
    const user = userEvent.setup();
    await renderBag();
    await waitFor(() => expect(screen.getByText('count:2')).toBeOnTheScreen());
    await user.press(screen.getByText('set4'));
    await user.press(screen.getByText('set3'));
    await waitFor(() => expect(screen.getByText('count:3')).toBeOnTheScreen());
    const before = gets();
    await act(async () => first.resolve({ signedIn: true, lines: [detail(4)], wishlist: [], adjusted: [] }));
    await flush();
    expect(gets()).toBe(before);
    server = [detail(3)];
    await act(async () => second.resolve({ signedIn: true, lines: server, wishlist: [], adjusted: [] }));
    await flush();
    await flush();
    expect(gets()).toBe(before + 1);
    expect(screen.getByText('count:3')).toBeOnTheScreen();
  });

  it('does not let an older change reply overwrite a newer one', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const patches = [first.promise, second.promise];
    let reads = 0;
    mockApi.mockImplementation((_path: string, options?: { method?: string }) => {
      if (options?.method === 'PATCH') return patches.shift()!;
      reads += 1;
      // The first read loads the bag; the refetch after the changes never answers, so only PATCH replies show.
      return reads === 1 ? Promise.resolve({ signedIn: true, lines: [detail(2)], wishlist: [] }) : new Promise(() => {});
    });
    const user = userEvent.setup();
    const { client } = await renderBag();
    await waitFor(() => expect(screen.getByText('count:2')).toBeOnTheScreen());
    await user.press(screen.getByText('set4'));
    await user.press(screen.getByText('set3'));
    await waitFor(() => expect(screen.getByText('count:3')).toBeOnTheScreen());
    await act(async () => second.resolve({ signedIn: true, lines: [detail(3)], wishlist: [], adjusted: [] }));
    await act(async () => first.resolve({ signedIn: true, lines: [detail(4)], wishlist: [], adjusted: [] }));
    await flush();
    expect(cachedCount(client)).toBe(3);
    expect(screen.getByText('count:3')).toBeOnTheScreen();
  });
});
