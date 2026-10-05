import { QueryClient, onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';

// networkMode 'always': offline calls fail at once with the network message (and bag changes
// roll back) instead of pausing silently until the phone reconnects.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, networkMode: 'always' },
    mutations: { networkMode: 'always' },
  },
});

// Still tracked so that reconnecting refetches what is on screen.
onlineManager.setEventListener((setOnline) => {
  const subscription = Network.addNetworkStateListener((state) => setOnline(state.isConnected !== false));
  return () => subscription.remove();
});
