import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

const mockSignIn = jest.fn();
jest.mock('@/features/auth/provider', () => ({ useAuth: () => ({ signIn: mockSignIn }) }));
jest.mock('expo-router', () => ({ router: { dismiss: jest.fn(), push: jest.fn() }, Link: () => null }));

import { ApiError } from '@/lib/api';
import { SignInForm } from '@/features/auth/forms/SignInForm';
import { router } from 'expo-router';

jest.mock('@/lib/supabase', () => ({ supabase: { auth: {} } }));

beforeEach(() => jest.clearAllMocks());

describe('SignInForm', () => {
  it('validates before calling the API', async () => {
    const user = userEvent.setup();
    await render(<SignInForm />);
    await user.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeOnTheScreen();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('shows the server message, keeps the email and clears the password', async () => {
    mockSignIn.mockRejectedValue(new ApiError('Email or password is incorrect.', 401));
    const user = userEvent.setup();
    await render(<SignInForm />);
    await user.type(screen.getByLabelText('Email'), 'tolu@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Email or password is incorrect.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Email').props.value).toBe('tolu@example.com');
    expect(screen.getByLabelText('Password').props.value).toBe('');
  });

  it('closes the modal after signing in', async () => {
    mockSignIn.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await render(<SignInForm />);
    await user.type(screen.getByLabelText('Email'), 'tolu@example.com');
    await user.type(screen.getByLabelText('Password'), 'right-password');
    await user.press(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.dismiss).toHaveBeenCalled());
    expect(mockSignIn).toHaveBeenCalledWith({ email: 'tolu@example.com', password: 'right-password' });
  });
});
