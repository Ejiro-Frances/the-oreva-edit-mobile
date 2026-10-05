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
let mockAuthState = { user: null as null | { id: string }, ready: true };
jest.mock('@/features/auth/provider', () => ({ useAuth: () => mockAuthState }));

import { ApiError } from '@/lib/api';
import { BagProvider, useBag } from '@/features/bag/provider';

const A = '00000000-0000-4000-8000-000000000001';
const detail = (quantity: number) => ({
  variantId: A,
  quantity,
  product: { id: 'p', slug: 's', name: 'Shirt', image: null, alt: '', price: 1000 },
  variant: { attributes: { Size: 'M' }, price: null, stock: 5 },
});

function Probe() {
  const bag = useBag();
  return (
    <>
      <Text>{`count:${bag.count}`}</Text>
      <Text>{`notice:${bag.notice}`}</Text>
      <Pressable onPress={() => bag.add(A, 1, 5)}><Text>add</Text></Pressable>
      <Pressable onPress={() => bag.setQuantity(A, 4)}><Text>set4</Text></Pressable>
    </>
  );
}

const renderBag = async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  const view = await render(
    <QueryClientProvider client={client}>
      <BagProvider><Probe /></BagProvider>
    </QueryClientProvider>,
  );
  return { client, view };
};

beforeEach(async () => {
  jest.clearAllMocks();
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

  it('keeps the guest bag when the merge fails', async () => {
    await AsyncStorage.setItem('oreva-bag-v1', JSON.stringify([{ variantId: A, quantity: 2 }]));
    mockApi.mockImplementation(async (_path: string, options?: { method?: string }) => {
      if (options?.method === 'POST') throw new ApiError("Can't reach the store. Check your connection and try again.", 0, 'network');
      return { signedIn: true, lines: [], wishlist: [] };
    });
    await renderBag();
    await waitFor(() => expect(screen.getByText(/notice:Can't reach the store/)).toBeOnTheScreen());
    expect(await AsyncStorage.getItem('oreva-bag-v1')).not.toBeNull();
  });

  it('applies a quantity change at once and keeps the server answer', async () => {
    mockApi.mockImplementation(async (_path: string, options?: { method?: string }) =>
      options?.method === 'PATCH' ? { signedIn: true, lines: [detail(4)], wishlist: [], adjusted: [] } : { signedIn: true, lines: [detail(2)], wishlist: [] },
    );
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

  it('tells the customer when the server capped a quantity', async () => {
    mockApi.mockImplementation(async (_path: string, options?: { method?: string }) =>
      options?.method === 'PATCH' ? { signedIn: true, lines: [detail(5)], wishlist: [], adjusted: [A] } : { signedIn: true, lines: [detail(2)], wishlist: [] },
    );
    const user = userEvent.setup();
    await renderBag();
    await waitFor(() => expect(screen.getByText('count:2')).toBeOnTheScreen());
    await user.press(screen.getByText('add'));
    await waitFor(() => expect(screen.getByText("notice:Quantity updated to what's in stock")).toBeOnTheScreen());
    await act(async () => {});
  });
});
