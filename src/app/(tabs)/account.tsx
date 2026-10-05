import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { colors } from '@/components/theme';
import { useAuth } from '@/features/auth/provider';

export default function AccountScreen() {
  const { user, ready, signOut } = useAuth();
  if (!ready) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }
  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 16 }}>
        <View style={{ gap: 16 }}>
          <AppText variant="display">Account</AppText>
          <AppText>Sign in to keep your bag on all your devices</AppText>
          <Button title="Sign in" onPress={() => router.push('/sign-in')} />
          <Button title="Create account" variant="secondary" onPress={() => router.push('/sign-up')} />
        </View>
      </SafeAreaView>
    );
  }
  const meta = user.user_metadata ?? {};
  const name =
    [meta.first_name, meta.last_name].filter(Boolean).join(' ') || (meta.full_name as string | undefined) || '';
  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <View style={{ gap: 16 }}>
        <AppText variant="display">Your account</AppText>
        <View style={{ gap: 4 }}>
          {name ? <AppText variant="title">{name}</AppText> : null}
          <AppText variant="muted">{user.email}</AppText>
        </View>
        <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
      </View>
    </SafeAreaView>
  );
}
