import { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { AppText } from './AppText';
import { colors, fonts } from './theme';

type Props = TextInputProps & { label: string; error?: string; required?: boolean };

export const Field = forwardRef<TextInput, Props>(function Field({ label, error, required, style, ...input }, ref) {
  return (
    <View style={styles.field}>
      <AppText variant="label">
        {label}
        {required ? <AppText style={{ color: colors.destructive }}> *</AppText> : null}
      </AppText>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[styles.input, error ? { borderColor: colors.destructive } : null, style]}
        {...input}
      />
      {error ? (
        <AppText accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  field: { gap: 6 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.foreground,
  },
  error: { color: colors.destructive, fontSize: 13 },
});
