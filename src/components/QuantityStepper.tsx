import { Pressable, StyleSheet, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { AppText } from './AppText';
import { colors } from './theme';

export function QuantityStepper({ value, max, onChange, label }: { value: number; max: number; onChange: (next: number) => void; label: string }) {
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Decrease quantity of ${label}`} disabled={value <= 1} onPress={() => onChange(value - 1)} style={[styles.button, value <= 1 && styles.off]}>
        <Minus size={16} color={colors.foreground} />
      </Pressable>
      <AppText accessibilityLabel={`Quantity ${value}`} style={styles.value}>{value}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={`Increase quantity of ${label}`} disabled={value >= max} onPress={() => onChange(value + 1)} style={[styles.button, value >= max && styles.off]}>
        <Plus size={16} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, alignSelf: 'flex-start' },
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.35 },
  value: { minWidth: 32, textAlign: 'center' },
});
