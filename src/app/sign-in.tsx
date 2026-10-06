import { ScrollView } from 'react-native';
import { AppText } from '@/components/AppText';
import { SignInForm } from '@/features/auth/forms/SignInForm';

export default function SignInScreen() {
  return (
    <ScrollView
      contentContainerStyle={{ padding: 24, gap: 24 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
    >
      <AppText variant="display">Sign in</AppText>
      <SignInForm />
    </ScrollView>
  );
}
