import { act, render, screen, userEvent } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { ToastProvider, useToast } from '@/components/Toast';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const onView = jest.fn();

function Trigger() {
  const toast = useToast();
  return (
    <Pressable
      onPress={() => toast.show({ message: 'Added to your bag', action: { label: 'View bag', onPress: onView } })}
    >
      <Text>trigger</Text>
    </Pressable>
  );
}

const renderToast = () =>
  render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>,
  );

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.useRealTimers());

describe('Toast', () => {
  it('shows a success message with its action', async () => {
    const user = userEvent.setup();
    await renderToast();
    await user.press(screen.getByText('trigger'));
    expect(screen.getByText('Added to your bag')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'View bag' }));
    expect(onView).toHaveBeenCalled();
    expect(screen.queryByText('Added to your bag')).toBeNull();
  });

  it('hides itself after a few seconds', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderToast();
    await user.press(screen.getByText('trigger'));
    expect(screen.getByText('Added to your bag')).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(4000);
    });
    expect(screen.queryByText('Added to your bag')).toBeNull();
  });
});
