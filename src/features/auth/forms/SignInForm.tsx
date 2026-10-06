import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { PasswordField } from '@/components/PasswordField';
import { colors } from '@/components/theme';
import { useAuth } from '@/features/auth/provider';
import { signInSchema, type SignInInput } from '@/lib/schemas';

export function SignInForm() {
  const { signIn } = useAuth();
  const [serverError, setServerError] = useState('');
  const { control, handleSubmit, setValue, formState } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });
  const submit = handleSubmit(async (input) => {
    setServerError('');
    try {
      await signIn(input);
      router.dismiss();
    } catch (error) {
      setValue('password', '');
      setServerError(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    }
  });
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
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <PasswordField
            label="Password"
            required
            autoComplete="current-password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <Button title="Sign in" onPress={submit} loading={formState.isSubmitting} />
      <Pressable accessibilityRole="link" onPress={() => router.push('/forgot-password')}>
        <AppText variant="muted">Forgot your password?</AppText>
      </Pressable>
    </View>
  );
}
