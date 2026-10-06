import { StyleSheet, Text, type TextProps } from 'react-native';
import { colors, fonts } from './theme';

type Variant = 'display' | 'title' | 'body' | 'label' | 'muted';

export function AppText({ variant = 'body', style, ...props }: TextProps & { variant?: Variant }) {
  return <Text {...props} style={[styles[variant], style]} />;
}

const styles = StyleSheet.create({
  display: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, color: colors.foreground },
  title: { fontFamily: fonts.displayBold, fontSize: 22, lineHeight: 28, color: colors.foreground },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.foreground },
  label: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: colors.foreground, letterSpacing: 0.4 },
  muted: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
});
