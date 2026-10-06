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
import { ApiError } from '@/lib/api';
import { signUpSchema, type SignUpInput } from '@/lib/schemas';

export function SignUpForm() {
  const { signUp } = useAuth();
  const [serverError, setServerError] = useState('');
  const [accountExists, setAccountExists] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const { control, handleSubmit, setValue, formState } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '', phone: '' },
  });
  const submit = handleSubmit(async (input) => {
    setServerError('');
    setAccountExists(false);
    try {
      const result = await signUp(input);
      if (result === 'signed-in') router.dismiss();
      else setConfirm(true);
    } catch (error) {
      setValue('password', '');
      setAccountExists(error instanceof ApiError && error.code === 'account_exists');
      setServerError(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    }
  });

  if (confirm) {
    return <AppText accessibilityRole="alert">Check your email to confirm your account, then sign in.</AppText>;
  }

  return (
    <View style={{ gap: 16 }}>
      {serverError ? (
        <View style={{ gap: 8 }}>
          <AppText accessibilityRole="alert" style={{ color: colors.destructive }}>
            {serverError}
          </AppText>
          {accountExists ? (
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Pressable accessibilityRole="link" onPress={() => router.replace('/sign-in')}>
                <AppText variant="muted">Sign in</AppText>
              </Pressable>
              <Pressable accessibilityRole="link" onPress={() => router.replace('/forgot-password')}>
                <AppText variant="muted">Reset password</AppText>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
      <Controller
        control={control}
        name="firstName"
        render={({ field, fieldState }) => (
          <Field
            label="First name"
            required
            autoComplete="given-name"
            autoCapitalize="words"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="lastName"
        render={({ field, fieldState }) => (
          <Field
            label="Last name"
            required
            autoComplete="family-name"
            autoCapitalize="words"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
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
      <View style={{ gap: 6 }}>
        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <PasswordField
              label="Password"
              required
              autoComplete="new-password"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        <AppText variant="muted">Use at least 8 characters</AppText>
      </View>
      <Controller
        control={control}
        name="phone"
        render={({ field, fieldState }) => (
          <Field
            label="Mobile number (optional)"
            autoComplete="tel"
            keyboardType="phone-pad"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <Button title="Create account" onPress={submit} loading={formState.isSubmitting} />
    </View>
  );
}
