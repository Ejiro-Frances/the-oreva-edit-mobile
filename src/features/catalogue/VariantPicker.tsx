import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { colors } from '@/components/theme';
import { isAvailable, optionKeys } from './selection';
import type { Product } from '@/lib/types';

type Props = { product: Product; selected: Record<string, string>; onChoose: (key: string, value: string) => void };

export function VariantPicker({ product, selected, onChoose }: Props) {
  return (
    <View style={{ gap: 16 }}>
      {optionKeys(product).map((key) => {
        const values = [...new Set(product.variants.map((v) => v.attributes[key]).filter(Boolean))];
        return (
          <View key={key} style={{ gap: 8 }}>
            <AppText variant="label">
              {key}
              {selected[key] ? ` — ${selected[key]}` : ''}
            </AppText>
            <View style={styles.options}>
              {values.map((value) => {
                const available = isAvailable(product, key, value, selected);
                const chosen = selected[key] === value;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={`${key}: ${value}${available ? '' : ' (sold out)'}`}
                    accessibilityState={{ disabled: !available, selected: chosen }}
                    disabled={!available}
                    onPress={() => onChoose(key, value)}
                    style={[styles.option, chosen && styles.chosen, !available && styles.soldOut]}
                  >
                    <AppText style={{ color: chosen ? colors.elevated : colors.foreground }}>{value}</AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { minWidth: 48, minHeight: 44, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  chosen: { backgroundColor: colors.foreground, borderColor: colors.foreground },
  soldOut: { opacity: 0.4 },
});
