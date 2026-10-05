import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Text, Pressable } from 'react-native';

const mockAuth = {
  getSession: jest.fn(),
  onAuthStateChange: jest.fn(),
  setSession: jest.fn(),
  signOut: jest.fn(),
};
jest.mock('@/lib/supabase', () => ({
  supabase: {
    get auth() {
      return mockAuth;
    },
  },
}));
const mockApi = jest.fn();
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return { ...actual, api: (...args: unknown[]) => mockApi(...args) };
});

import { AuthProvider, useAuth } from '@/features/auth/provider';

let emit: (event: string, session: unknown) => void = () => {};
const tokens = { access_token: 'a.b.c', refresh_token: 'r', expires_at: 1 };

function Probe({ onResult }: { onResult?: (r: unknown) => void }) {
  const { user, ready, signIn, signUp } = useAuth();
  return (
    <>
      <Text>{ready ? `user:${user?.id ?? 'none'}` : 'loading'}</Text>
      <Pressable onPress={() => signIn({ email: 'a@b.co', password: 'pw' })}>
        <Text>sign in</Text>
      </Pressable>
      <Pressable
        onPress={async () =>
          onResult?.(await signUp({ firstName: 'A', lastName: 'B', email: 'a@b.co', password: 'longenough', phone: '' }))
        }
      >
        <Text>sign up</Text>
      </Pressable>
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.getSession.mockResolvedValue({ data: { session: null } });
  mockAuth.onAuthStateChange.mockImplementation((cb) => {
    emit = cb;
    return { data: { subscription: { unsubscribe: jest.fn() } } };
  });
  mockAuth.setSession.mockImplementation(async () => {
    emit('SIGNED_IN', { user: { id: 'user-1' } });
    return { data: {}, error: null };
  });
});

describe('AuthProvider', () => {
  it('starts as a guest once the stored session is read', async () => {
    await render(<AuthProvider><Probe /></AuthProvider>);
    expect(await screen.findByText('user:none')).toBeOnTheScreen();
  });

  it('signs in through the store API in mobile mode and adopts the session', async () => {
    mockApi.mockResolvedValue({ ok: true, session: tokens });
    const user = userEvent.setup();
    await render(<AuthProvider><Probe /></AuthProvider>);
    await user.press(await screen.findByText('sign in'));
    expect(mockApi).toHaveBeenCalledWith('/api/auth/sign-in', {
      method: 'POST',
      body: { email: 'a@b.co', password: 'pw', client: 'mobile' },
    });
    expect(mockAuth.setSession).toHaveBeenCalledWith({ access_token: 'a.b.c', refresh_token: 'r' });
    await waitFor(() => expect(screen.getByText('user:user-1')).toBeOnTheScreen());
  });

  it('reports when sign-up needs email confirmation instead of signing in', async () => {
    mockApi.mockResolvedValue({ ok: true, confirm: true });
    const onResult = jest.fn();
    const user = userEvent.setup();
    await render(<AuthProvider><Probe onResult={onResult} /></AuthProvider>);
    await user.press(await screen.findByText('sign up'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith('confirm'));
    expect(mockAuth.setSession).not.toHaveBeenCalled();
  });
});
