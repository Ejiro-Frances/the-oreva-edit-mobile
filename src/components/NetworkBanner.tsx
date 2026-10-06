import { Pressable, StyleSheet, View } from 'react-native';
import { useNetworkState } from 'expo-network';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { colors } from './theme';

export function NetworkBanner() {
  const { isConnected, isInternetReachable } = useNetworkState();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  if (isConnected !== false && isInternetReachable !== false) return null;
  return (
    <View accessibilityRole="alert" style={[styles.banner, { paddingTop: insets.top + 8 }]}>
      <AppText style={styles.text}>Can&apos;t reach the store. Check your connection and try again.</AppText>
      <Pressable accessibilityRole="button" onPress={() => void queryClient.refetchQueries({ type: 'active' })}>
        <AppText style={[styles.text, styles.retry]}>Retry</AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.foreground, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', gap: 12, alignItems: 'center' },
  text: { color: colors.elevated, flexShrink: 1 },
  retry: { textDecorationLine: 'underline' },
});
