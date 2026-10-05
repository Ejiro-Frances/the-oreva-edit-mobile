import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { AppText } from '@/components/AppText';
import { colors } from '@/components/theme';
import { useCategories } from './queries';

type Filters = { audience?: string; category?: string };
type Props = Filters & { onChange: (next: Filters) => void };

const AUDIENCES: { label: string; value?: string }[] = [
  { label: 'All', value: undefined },
  { label: 'Women', value: 'women' },
  { label: 'Men', value: 'men' },
  { label: 'Kids', value: 'kids' },
];

export function AudienceFilter({ audience, category, onChange }: Props) {
  const { data: categories } = useCategories();
  const topLevel = (categories ?? []).filter((c) => c.parent_id === null);

  const chip = (label: string, selected: boolean, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityLabel={label}
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {AUDIENCES.map((a) =>
        chip(a.label, audience === a.value && !category, () => onChange({ audience: a.value }), `a-${a.label}`),
      )}
      {topLevel.map((c) =>
        chip(c.name, category === c.slug, () => onChange({ audience, category: c.slug }), `c-${c.id}`),
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  chosen: { backgroundColor: colors.foreground, borderColor: colors.foreground },
});
