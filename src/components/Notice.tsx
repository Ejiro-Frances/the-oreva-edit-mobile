import { Pressable, StyleSheet, View } from 'react-native';
import { X } from 'lucide-react-native';
import { AppText } from './AppText';
import { colors } from './theme';

export function Notice({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <View style={styles.note} accessibilityLiveRegion="polite">
      <AppText style={{ flex: 1 }}>{message}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onClose} style={styles.close}>
        <X size={16} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    paddingLeft: 12,
  },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
