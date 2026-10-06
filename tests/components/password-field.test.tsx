import { render, screen, userEvent } from '@testing-library/react-native';
import { PasswordField } from '@/components/PasswordField';

describe('PasswordField', () => {
  it('hides the password until the eye button is pressed, then hides it again', async () => {
    const user = userEvent.setup();
    await render(<PasswordField label="Password" value="secret-pass" onChangeText={jest.fn()} />);
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);

    await user.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);

    await user.press(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  });

  it('still shows the field error', async () => {
    await render(<PasswordField label="Password" error="Use at least 8 characters" />);
    expect(screen.getByText('Use at least 8 characters')).toBeOnTheScreen();
  });
});
