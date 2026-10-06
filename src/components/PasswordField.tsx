import { forwardRef, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, type TextInput } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { Field } from './Field';
import { colors } from './theme';

type Props = Omit<ComponentProps<typeof Field>, 'secureTextEntry' | 'trailing'>;

/** A single password field with a show/hide toggle, matching the website's sign-in forms. */
export const PasswordField = forwardRef<TextInput, Props>(function PasswordField(props, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <Field
      ref={ref}
      {...props}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          accessibilityState={{ checked: visible }}
          hitSlop={4}
          onPress={() => setVisible((v) => !v)}
          style={styles.toggle}
        >
          {visible ? <EyeOff size={20} color={colors.muted} /> : <Eye size={20} color={colors.muted} />}
        </Pressable>
      }
    />
  );
});

const styles = StyleSheet.create({
  toggle: { width: 48, height: 46, alignItems: 'center', justifyContent: 'center' },
});
