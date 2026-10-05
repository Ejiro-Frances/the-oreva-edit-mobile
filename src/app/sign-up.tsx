import { ScrollView } from 'react-native';
import { AppText } from '@/components/AppText';
import { SignUpForm } from '@/features/auth/forms/SignUpForm';

export default function SignUpScreen() {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 24 }} keyboardShouldPersistTaps="handled">
      <AppText variant="display">Create account</AppText>
      <SignUpForm />
    </ScrollView>
  );
}
