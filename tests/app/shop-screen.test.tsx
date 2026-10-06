import { render, screen, userEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import all from './all.fixture.json';
import dresses from './dresses.fixture.json';
import categories from './categories.fixture.json';

jest.mock('@/lib/supabase', () => ({ supabase: { auth: {} } }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
const mockApi = jest.fn();
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return { ...actual, api: (...args: unknown[]) => mockApi(...args) };
});

import ShopScreen from '@/app/(tabs)/index';

const none = { products: [], page: 1, pageSize: 12, total: 0 };

beforeEach(() => {
  mockApi.mockImplementation(async (path: string) => {
    if (path === '/api/catalogue/categories') return categories;
    if (path.includes('audience=men') && path.includes('category=dresses')) return none;
    if (path.includes('category=dresses')) return dresses;
    return all;
  });
});

const renderShop = async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={client}>
      <ShopScreen />
    </QueryClientProvider>,
  );
};
const chip = (name: string) => screen.getByRole('button', { name });
const selected = (name: string) => chip(name).props.accessibilityState?.selected;

describe('Shop tab', () => {
  it('shows the pieces in a category after choosing it', async () => {
    const user = userEvent.setup();
    await renderShop();
    expect(await screen.findByText('The Sade midi dress')).toBeOnTheScreen();
    await user.press(await screen.findByRole('button', { name: 'Dresses' }));
    expect(await screen.findByText('The Sunday column dress')).toBeOnTheScreen();
    expect(mockApi).toHaveBeenCalledWith('/api/catalogue/products?page=1&category=dresses');
  });

  it('always shows which audience and category are applied', async () => {
    const user = userEvent.setup();
    await renderShop();
    await user.press(await screen.findByRole('button', { name: 'Men' }));
    await user.press(await screen.findByRole('button', { name: 'Dresses' }));
    expect(selected('Men')).toBe(true);
    expect(selected('Dresses')).toBe(true);
    expect(selected('All audiences')).toBe(false);
    expect(selected('All categories')).toBe(false);
  });

  it('explains an empty combination and clears the filters', async () => {
    const user = userEvent.setup();
    await renderShop();
    await user.press(await screen.findByRole('button', { name: 'Men' }));
    await user.press(await screen.findByRole('button', { name: 'Dresses' }));
    expect(await screen.findByText('No pieces match these filters.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('The Sade midi dress')).toBeOnTheScreen();
    expect(selected('All audiences')).toBe(true);
    expect(selected('All categories')).toBe(true);
  });
});
