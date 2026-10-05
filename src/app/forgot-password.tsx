import { ScrollView } from 'react-native';
import { AppText } from '@/components/AppText';
import { ForgotPasswordForm } from '@/features/auth/forms/ForgotPasswordForm';

export default function ForgotPasswordScreen() {
  return (
    <ScrollView
      contentContainerStyle={{ padding: 24, gap: 24 }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
    >
      <AppText variant="display">Reset password</AppText>
      <ForgotPasswordForm />
    </ScrollView>
  );
}
