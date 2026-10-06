import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { colors } from '@/components/theme';
import { useCategories } from './queries';

type Filters = { audience?: string; category?: string };
type Props = Filters & { onChange: (next: Filters) => void };

const AUDIENCES: { label: string; accessibilityLabel: string; value?: string }[] = [
  { label: 'All', accessibilityLabel: 'All audiences', value: undefined },
  { label: 'Women', accessibilityLabel: 'Women', value: 'women' },
  { label: 'Men', accessibilityLabel: 'Men', value: 'men' },
  { label: 'Kids', accessibilityLabel: 'Kids', value: 'kids' },
];

/**
 * Two rows so both filters are always visible: who it is for, and what it is. Each row keeps the
 * other's choice, so the selected chips always describe exactly what the list is showing.
 */
export function AudienceFilter({ audience, category, onChange }: Props) {
  const { data: categories } = useCategories();
  const topLevel = (categories ?? []).filter((c) => c.parent_id === null);

  const chip = (label: string, accessibilityLabel: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={accessibilityLabel}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chosen]}
    >
      <AppText variant="label" style={{ color: selected ? colors.elevated : colors.foreground }}>
        {label}
      </AppText>
    </Pressable>
  );

  return (
    <View style={styles.rows}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.row}
      >
        {AUDIENCES.map((a) =>
          chip(a.label, a.accessibilityLabel, audience === a.value, () =>
            onChange({ audience: a.value, category }),
          ),
        )}
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.row}
      >
        {chip('All', 'All categories', !category, () => onChange({ audience, category: undefined }))}
        {topLevel.map((c) =>
          chip(c.name, c.name, category === c.slug, () => onChange({ audience, category: c.slug })),
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rows: { paddingVertical: 4 },
  // A ScrollView grows to fill free space by default; the chip rows must keep their own height.
  scroll: { flexGrow: 0 },
  row: { paddingHorizontal: 16, paddingVertical: 4, gap: 8, alignItems: 'center' },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chosen: { backgroundColor: colors.foreground, borderColor: colors.foreground },
});
