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
const LEGACY = 'oreva-bag-v1';
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
type Options = { method?: string; auth?: boolean; guest?: boolean; body?: unknown };
type Call = [string, Options | undefined];
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
      <Pressable onPress={async () => setResult(String(await bag.add(A, 1)))}><Text>add</Text></Pressable>
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
/** Waits until the bag has settled and loaded, then checks it shows `count`. */
const loaded = async (count: number) => {
  await waitFor(() => expect(screen.getByText('ready:true')).toBeOnTheScreen());
  expect(screen.getByText(`count:${count}`)).toBeOnTheScreen();
};
const bagView = (lines: ReturnType<typeof detail>[], signedIn = true) => ({ signedIn, lines, wishlist: [] });

beforeEach(async () => {
  jest.clearAllMocks();
  mockApi.mockReset();
  await AsyncStorage.clear();
  mockAuthState = { user: null, ready: true };
});

describe('before the session is known', () => {
  it('makes no request and is not ready', async () => {
    mockAuthState = { user: null, ready: false };
    mockApi.mockResolvedValue(bagView([detail(1)], false));
    const { client, view } = await renderBag();
    await flush();
    expect(mockApi).not.toHaveBeenCalled();
    expect(screen.getByText('ready:false')).toBeOnTheScreen();
    mockAuthState = { user: null, ready: true };
    await view.rerender(tree(client));
    await loaded(1);
  });
});

describe('guest bag', () => {
  it('lives on the server: reads and adds with the guest token, never writing to the phone', async () => {
    // The AsyncStorage mock is already a jest.fn: spying returns it, and restoring would wipe its implementation.
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    mockApi.mockImplementation(async (_path: string, options?: Options) =>
      options?.method === 'PATCH' ? { ...bagView([detail(2)], false), adjusted: [] } : bagView([detail(1)], false),
    );
    const user = userEvent.setup();
    await renderBag();
    await loaded(1);
    expect(mockApi).toHaveBeenCalledWith('/api/shopping', { auth: false, guest: true });
    await user.press(screen.getByText('add'));
    await waitFor(() => expect(screen.getByText('result:true')).toBeOnTheScreen());
    expect(mockApi).toHaveBeenCalledWith('/api/shopping', {
      method: 'PATCH',
      auth: false,
      guest: true,
      body: { ops: [{ op: 'add', variantId: A, quantity: 1 }] },
    });
    await flush();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('uploads a bag an older version kept on the phone once, then removes it', async () => {
    await AsyncStorage.setItem(LEGACY, JSON.stringify([{ variantId: A, quantity: 2 }]));
    mockApi.mockResolvedValue(bagView([detail(2)], false));
    const first = await renderBag();
    await loaded(2);
    expect(posts()).toEqual([
      [
        '/api/shopping',
        { method: 'POST', auth: false, guest: true, body: { action: 'merge', lines: [{ variantId: A, quantity: 2 }], wishlist: [] } },
      ],
    ]);
    expect(await AsyncStorage.getItem(LEGACY)).toBeNull();
    await first.view.unmount();
    await renderBag();
    await loaded(2);
    expect(posts()).toHaveLength(1);
  });

  it('sends no merge when the phone holds no old bag', async () => {
    mockApi.mockResolvedValue(bagView([], false));
    await renderBag();
    await loaded(0);
    expect(posts()).toHaveLength(0);
    // Nothing moved, so the first read stands: no second request on every launch.
    expect(gets()).toBe(1);
  });

  it('keeps the old bag and still loads when the upload fails', async () => {
    await AsyncStorage.setItem(LEGACY, JSON.stringify([{ variantId: A, quantity: 2 }]));
    mockApi.mockImplementation(async (_path: string, options?: Options) => {
      if (options?.method === 'POST') throw offline();
      return bagView([detail(1)], false);
    });
    await renderBag();
    await loaded(1);
    expect(screen.getByText(/notice:Can't reach the store/)).toBeOnTheScreen();
    expect(await AsyncStorage.getItem(LEGACY)).not.toBeNull();
  });
});

describe('signed-in bag', () => {
  beforeEach(() => {
    mockAuthState = { user: { id: 'user-1' }, ready: true };
  });

  it('moves the guest bag into the account once per sign-in and shows the merged bag it answers with', async () => {
    const merge = deferred<unknown>();
    // The account bag read at sign-in predates the merge, which adds a line.
    mockApi.mockImplementation((_path: string, options?: Options) =>
      options?.method === 'POST' ? merge.promise : Promise.resolve(bagView([detail(1)])),
    );
    await renderBag();
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toEqual([
      '/api/shopping',
      { method: 'POST', auth: true, guest: true, body: { action: 'merge', lines: [], wishlist: [] } },
    ]);
    await flush();
    expect(screen.getByText('ready:false')).toBeOnTheScreen();
    expect(gets()).toBe(1);
    await act(async () => merge.resolve(bagView([detail(1), detail(1, B)])));
    await loaded(2);
    await flush();
    // The merge reply is the bag: no second read.
    expect(gets()).toBe(1);
    expect(screen.getByText('count:2')).toBeOnTheScreen();
    expect(mockApi).toHaveBeenCalledWith('/api/shopping', { auth: true, guest: true });
    expect(posts()).toHaveLength(1);
  });

  it('does not let a bag read that started before the merge hide it', async () => {
    const read = deferred<unknown>();
    mockApi.mockImplementation((_path: string, options?: Options) =>
      options?.method === 'POST' ? Promise.resolve(bagView([detail(3)])) : read.promise,
    );
    await renderBag();
    await loaded(3);
    await act(async () => read.resolve(bagView([])));
    await flush();
    expect(screen.getByText('count:3')).toBeOnTheScreen();
    expect(gets()).toBe(1);
  });

  it('shows the merged account bag even when a guest change is still out at sign-in', async () => {
    mockAuthState = { user: null, ready: true };
    const patch = deferred<unknown>();
    mockApi.mockImplementation((_path: string, options?: Options) => {
      if (options?.method === 'PATCH') return patch.promise;
      if (options?.method === 'POST') return Promise.resolve(bagView([detail(3)]));
      // The guest bag loads; account reads never answer, so only the merge reply can show.
      return options?.auth ? new Promise(() => {}) : Promise.resolve(bagView([detail(1)], false));
    });
    const user = userEvent.setup();
    const { client, view } = await renderBag();
    await loaded(1);
    await user.press(screen.getByText('set4'));
    await waitFor(() => expect(screen.getByText('count:4')).toBeOnTheScreen());
    mockAuthState = { user: { id: 'user-1' }, ready: true };
    await view.rerender(tree(client));
    await loaded(3);
    // The guest reply lands in the guest bag, not the account's.
    await act(async () => patch.resolve({ ...bagView([detail(4)], false), adjusted: [] }));
    await flush();
    expect(screen.getByText('count:3')).toBeOnTheScreen();
    expect(cachedCount(client)).toBe(3);
  });

  it('includes a bag an older version kept on the phone, then removes it', async () => {
    await AsyncStorage.setItem(LEGACY, JSON.stringify([{ variantId: A, quantity: 2 }]));
    mockApi.mockResolvedValue(bagView([detail(2)]));
    await renderBag();
    await loaded(2);
    expect(posts()).toEqual([
      [
        '/api/shopping',
        { method: 'POST', auth: true, guest: true, body: { action: 'merge', lines: [{ variantId: A, quantity: 2 }], wishlist: [] } },
      ],
    ]);
    expect(await AsyncStorage.getItem(LEGACY)).toBeNull();
  });

  it('posts the merge once when the provider remounts while it is in flight', async () => {
    const merge = deferred<unknown>();
    mockApi.mockImplementation((_path: string, options?: Options) =>
      options?.method === 'POST' ? merge.promise : Promise.resolve(bagView([detail(2)])),
    );
    const { client, view } = await renderBag();
    await waitFor(() => expect(posts()).toHaveLength(1));
    await view.unmount();
    await render(tree(client));
    await flush();
    await act(async () => merge.resolve(bagView([detail(2)])));
    await loaded(2);
    expect(posts()).toHaveLength(1);
  });

  it('keeps the next account ready when an earlier account’s merge lands late', async () => {
    const slow = deferred<unknown>();
    let postsSeen = 0;
    mockApi.mockImplementation((_path: string, options?: Options) => {
      if (options?.method === 'POST') {
        postsSeen += 1;
        // user-1's merge hangs; user-2's answers at once.
        return postsSeen === 1 ? slow.promise : Promise.resolve(bagView([]));
      }
      return Promise.resolve(bagView([detail(1)]));
    });
    const { client, view } = await renderBag();
    await waitFor(() => expect(posts()).toHaveLength(1));
    mockAuthState = { user: null, ready: true };
    await view.rerender(tree(client));
    mockAuthState = { user: { id: 'user-2' }, ready: true };
    await view.rerender(tree(client));
    await waitFor(() => expect(screen.getByText('ready:true')).toBeOnTheScreen());
    await act(async () => slow.resolve(bagView([])));
    await flush();
    expect(screen.getByText('ready:true')).toBeOnTheScreen();
  });

  it('is not ready for a returning account until its merge lands again', async () => {
    const second = deferred<unknown>();
    let postsSeen = 0;
    mockApi.mockImplementation((_path: string, options?: Options) => {
      if (options?.method === 'POST') {
        postsSeen += 1;
        return postsSeen === 1 ? Promise.resolve(bagView([detail(1)])) : second.promise;
      }
      return Promise.resolve(bagView([detail(1)]));
    });
    const { client, view } = await renderBag();
    await loaded(1);
    // Signed out only briefly: the guest settle is still reading the phone when the account returns.
    const guestRead = deferred<string | null>();
    jest.mocked(AsyncStorage.getItem).mockImplementationOnce(() => guestRead.promise);
    mockAuthState = { user: null, ready: true };
    await view.rerender(tree(client));
    mockAuthState = { user: { id: 'user-1' }, ready: true };
    await view.rerender(tree(client));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(screen.getByText('ready:false')).toBeOnTheScreen();
    await act(async () => second.resolve(bagView([detail(1)])));
    await waitFor(() => expect(screen.getByText('ready:true')).toBeOnTheScreen());
    await act(async () => guestRead.resolve(null));
  });

  it('explains a failed merge, keeps the old bag, and still loads the account bag', async () => {
    await AsyncStorage.setItem(LEGACY, JSON.stringify([{ variantId: A, quantity: 2 }]));
    mockApi.mockImplementation(async (_path: string, options?: Options) => {
      if (options?.method === 'POST') throw offline();
      return bagView([detail(1)]);
    });
    await renderBag();
    await loaded(1);
    expect(screen.getByText(/notice:Can't reach the store/)).toBeOnTheScreen();
    expect(await AsyncStorage.getItem(LEGACY)).not.toBeNull();
  });

  it('shows an error, not an empty bag, when the bag cannot be loaded, and retries', async () => {
    // The store is out of reach until the customer retries: the merge and the first load both fail.
    let failing = true;
    mockApi.mockImplementation(async (_path: string, options?: Options) => {
      if (failing) throw offline();
      return bagView([detail(2)]);
    });
    const user = userEvent.setup();
    await renderBag();
    await waitFor(() => expect(screen.getByText('ready:true')).toBeOnTheScreen());
    expect(screen.getByText(/error:Can't reach the store/)).toBeOnTheScreen();
    expect(screen.getByText('count:0')).toBeOnTheScreen();
    failing = false;
    await user.press(screen.getByText('retry'));
    await waitFor(() => expect(screen.getByText('count:2')).toBeOnTheScreen());
    expect(screen.getByText('error:')).toBeOnTheScreen();
  });

  it('applies a quantity change at once and keeps the server answer', async () => {
    // The server answers GET with whatever the last PATCH left behind.
    let server = [detail(2)];
    mockApi.mockImplementation(async (_path: string, options?: Options) => {
      if (options?.method === 'PATCH') {
        server = [detail(4)];
        return { ...bagView(server), adjusted: [] };
      }
      return bagView(server);
    });
    const user = userEvent.setup();
    await renderBag();
    await loaded(2);
    await user.press(screen.getByText('set4'));
    expect(screen.getByText('count:4')).toBeOnTheScreen();
    expect(mockApi).toHaveBeenCalledWith('/api/shopping', {
      method: 'PATCH',
      auth: true,
      guest: true,
      body: { ops: [{ op: 'set', variantId: A, quantity: 4 }] },
    });
  });

  it('rolls back and explains a rejected change', async () => {
    mockApi.mockImplementation(async (_path: string, options?: Options) => {
      if (options?.method === 'PATCH') throw new ApiError('nope', 500);
      return bagView([detail(2)]);
    });
    const user = userEvent.setup();
    await renderBag();
    await loaded(2);
    await user.press(screen.getByText('set4'));
    await waitFor(() => expect(screen.getByText('count:2')).toBeOnTheScreen());
    expect(screen.getByText('notice:Your bag could not be updated. Please try again.')).toBeOnTheScreen();
  });

  it('reports an add the server took as added', async () => {
    mockApi.mockImplementation(async (_path: string, options?: Options) =>
      options?.method === 'PATCH' ? { ...bagView([detail(3)]), adjusted: [] } : bagView([detail(2)]),
    );
    const user = userEvent.setup();
    await renderBag();
    await loaded(2);
    await user.press(screen.getByText('add'));
    await waitFor(() => expect(screen.getByText('result:true')).toBeOnTheScreen());
    await flush();
  });

  it('reports a failed add as nothing added', async () => {
    mockApi.mockImplementation(async (_path: string, options?: Options) => {
      if (options?.method === 'PATCH') throw offline();
      return bagView([detail(2)]);
    });
    const user = userEvent.setup();
    await renderBag();
    await loaded(2);
    await user.press(screen.getByText('add'));
    await waitFor(() => expect(screen.getByText('result:false')).toBeOnTheScreen());
    expect(screen.getByText(/notice:Can't reach the store/)).toBeOnTheScreen();
  });

  it('tells the customer when the server capped a quantity', async () => {
    let server = [detail(2)];
    mockApi.mockImplementation(async (_path: string, options?: Options) => {
      if (options?.method === 'PATCH') {
        server = [detail(5)];
        return { ...bagView(server), adjusted: [A] };
      }
      return bagView(server);
    });
    const user = userEvent.setup();
    await renderBag();
    await loaded(2);
    await user.press(screen.getByText('add'));
    await waitFor(() => expect(screen.getByText("notice:Quantity updated to what's in stock")).toBeOnTheScreen());
    await act(async () => {});
  });

  it('reports nothing added when the server capped an add at what the bag held', async () => {
    mockApi.mockImplementation(async (_path: string, options?: Options) =>
      options?.method === 'PATCH' ? { ...bagView([detail(5)]), adjusted: [A] } : bagView([detail(5)]),
    );
    const user = userEvent.setup();
    await renderBag();
    await loaded(5);
    await user.press(screen.getByText('add'));
    await waitFor(() => expect(screen.getByText('result:false')).toBeOnTheScreen());
    expect(screen.getByText("notice:Quantity updated to what's in stock")).toBeOnTheScreen();
  });

  it('does not let a bag read that lands during a change overwrite it', async () => {
    let server = [detail(2)];
    const patch = deferred<unknown>();
    mockApi.mockImplementation((_path: string, options?: Options) =>
      options?.method === 'PATCH' ? patch.promise : Promise.resolve(bagView(server)),
    );
    const user = userEvent.setup();
    const { client } = await renderBag();
    await loaded(2);
    await user.press(screen.getByText('set4'));
    await waitFor(() => expect(screen.getByText('count:4')).toBeOnTheScreen());
    // e.g. a reconnect or a Realtime nudge refetches while the PATCH is still out
    await act(() => client.invalidateQueries({ queryKey: ['bag', 'user-1'] }));
    expect(cachedCount(client)).toBe(4);
    await flush();
    expect(screen.getByText('count:4')).toBeOnTheScreen();
    server = [detail(4)];
    await act(async () => patch.resolve({ ...bagView(server), adjusted: [] }));
    await waitFor(() => expect(screen.getByText('count:4')).toBeOnTheScreen());
  });

  it('refetches the bag exactly once after the last change settles', async () => {
    let server = [detail(2)];
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const patches = [first.promise, second.promise];
    mockApi.mockImplementation((_path: string, options?: Options) =>
      options?.method === 'PATCH' ? patches.shift()! : Promise.resolve(bagView(server)),
    );
    const user = userEvent.setup();
    await renderBag();
    await loaded(2);
    await user.press(screen.getByText('set4'));
    await user.press(screen.getByText('set3'));
    await waitFor(() => expect(screen.getByText('count:3')).toBeOnTheScreen());
    const before = gets();
    await act(async () => first.resolve({ ...bagView([detail(4)]), adjusted: [] }));
    await flush();
    expect(gets()).toBe(before);
    server = [detail(3)];
    await act(async () => second.resolve({ ...bagView(server), adjusted: [] }));
    await flush();
    await flush();
    expect(gets()).toBe(before + 1);
    expect(screen.getByText('count:3')).toBeOnTheScreen();
  });

  it('does not let an older change reply overwrite a newer one', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const patches = [first.promise, second.promise];
    let hold = false;
    mockApi.mockImplementation((_path: string, options?: Options) => {
      if (options?.method === 'PATCH') return patches.shift()!;
      // Once the bag has loaded, reads never answer, so only PATCH replies show.
      return hold ? new Promise(() => {}) : Promise.resolve(bagView([detail(2)]));
    });
    const user = userEvent.setup();
    const { client } = await renderBag();
    await loaded(2);
    hold = true;
    await user.press(screen.getByText('set4'));
    await user.press(screen.getByText('set3'));
    await waitFor(() => expect(screen.getByText('count:3')).toBeOnTheScreen());
    await act(async () => second.resolve({ ...bagView([detail(3)]), adjusted: [] }));
    await act(async () => first.resolve({ ...bagView([detail(4)]), adjusted: [] }));
    await flush();
    expect(cachedCount(client)).toBe(3);
    expect(screen.getByText('count:3')).toBeOnTheScreen();
  });
});
