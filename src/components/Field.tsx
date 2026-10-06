import { forwardRef, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { AppText } from './AppText';
import { colors, fonts } from './theme';

type Props = TextInputProps & {
  label: string;
  error?: string;
  required?: boolean;
  /** Rendered inside the input's border, after the text (e.g. a show/hide button). */
  trailing?: ReactNode;
};

export const Field = forwardRef<TextInput, Props>(function Field(
  { label, error, required, trailing, style, ...input },
  ref,
) {
  return (
    <View style={styles.field}>
      <AppText variant="label">
        {label}
        {required ? <AppText style={{ color: colors.destructive }}> *</AppText> : null}
      </AppText>
      <View style={[styles.box, error ? { borderColor: colors.destructive } : null]}>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.muted}
          style={[styles.input, style]}
          {...input}
        />
        {trailing}
      </View>
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
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  input: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.foreground,
  },
  error: { color: colors.destructive, fontSize: 13 },
});
