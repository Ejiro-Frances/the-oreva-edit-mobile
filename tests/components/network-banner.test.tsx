import { render, screen } from '@testing-library/react-native';
import { useNetworkState } from 'expo-network';
import { NetworkBanner } from '@/components/NetworkBanner';

jest.mock('expo-network', () => ({ useNetworkState: jest.fn(), addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })) }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ refetchQueries: jest.fn() }) }));

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const MESSAGE = "Can't reach the store. Check your connection and try again.";

it('shows the offline message when the phone is offline', async () => {
  (useNetworkState as jest.Mock).mockReturnValue({ isConnected: false, isInternetReachable: false });
  await render(<NetworkBanner />);
  expect(screen.getByText(MESSAGE)).toBeOnTheScreen();
});

it('renders nothing when the phone is online', async () => {
  (useNetworkState as jest.Mock).mockReturnValue({ isConnected: true, isInternetReachable: true });
  await render(<NetworkBanner />);
  expect(screen.queryByText(MESSAGE)).not.toBeOnTheScreen();
});
