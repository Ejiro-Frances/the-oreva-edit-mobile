import { useState } from 'react';
import { View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { colors } from '@/components/theme';
import { useAuth } from '@/features/auth/provider';
import { ApiError } from '@/lib/api';
import { emailOnlySchema } from '@/lib/schemas';

type Input = { email: string };

export function ForgotPasswordForm() {
  const { forgotPassword } = useAuth();
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState('');
  const { control, handleSubmit, formState } = useForm<Input>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: { email: '' },
  });
  const submit = handleSubmit(async ({ email }) => {
    setServerError('');
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (error) {
      // Same answer whether or not the account exists; only connection problems are surfaced.
      if (error instanceof ApiError && error.code === 'network') setServerError(error.message);
      else setSent(true);
    }
  });

  if (sent) {
    return (
      <AppText accessibilityRole="alert">
        If an account exists for that email, we&apos;ve sent a link to reset your password. The link opens on the website.
      </AppText>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      {serverError ? (
        <AppText accessibilityRole="alert" style={{ color: colors.destructive }}>
          {serverError}
        </AppText>
      ) : null}
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <Field
            label="Email"
            required
            autoComplete="email"
            keyboardType="email-address"
            autoCapitalize="none"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <Button title="Send reset link" onPress={submit} loading={formState.isSubmitting} />
    </View>
  );
}
