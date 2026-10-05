import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { QuantityStepper } from '@/components/QuantityStepper';
import { colors } from '@/components/theme';
import { useBag } from '@/features/bag/provider';
import { assetUrl } from '@/lib/config';
import { money } from '@/lib/money';
import type { BagLine } from '@/lib/types';

const unitPrice = (line: BagLine) => line.variant.price ?? line.product.price;

export default function BagScreen() {
  const { lines, ready, signedIn, notice, clearNotice, setQuantity, remove } = useBag();
  const subtotal = lines.reduce((sum, line) => sum + unitPrice(line) * line.quantity, 0);

  return (
    <SafeAreaView style={styles.screen}>
      <AppText variant="display">Your bag</AppText>
      {notice ? (
        <View style={styles.notice}>
          <AppText style={{ flex: 1 }}>{notice}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={clearNotice} style={styles.close}>
            <X size={16} color={colors.foreground} />
          </Pressable>
        </View>
      ) : null}
      {!ready ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : lines.length === 0 ? (
        <View style={styles.empty}>
          <AppText variant="title">Your bag is empty</AppText>
          <Button title="Shop the edit" onPress={() => router.navigate('/')} />
          {!signedIn ? <AppText variant="muted">Sign in to keep your bag on all your devices</AppText> : null}
        </View>
      ) : (
        <FlatList
          data={lines}
          keyExtractor={(line) => line.variantId}
          contentContainerStyle={{ gap: 16, paddingVertical: 16 }}
          renderItem={({ item: line }) => (
            <View style={styles.row}>
              <Image
                source={assetUrl(line.product.image)}
                style={styles.image}
                contentFit="cover"
                accessibilityLabel={line.product.alt || line.product.name}
              />
              <View style={styles.info}>
                <AppText>{line.product.name}</AppText>
                <AppText variant="muted">{Object.values(line.variant.attributes).join(' / ')}</AppText>
                <AppText>{money(unitPrice(line))}</AppText>
                <QuantityStepper
                  value={line.quantity}
                  max={Math.min(line.variant.stock, 20)}
                  label={line.product.name}
                  onChange={(q) => setQuantity(line.variantId, q)}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${line.product.name}`}
                  onPress={() => remove(line.variantId)}
                  style={styles.remove}
                >
                  <AppText variant="label" style={{ textDecorationLine: 'underline' }}>
                    Remove
                  </AppText>
                </Pressable>
              </View>
            </View>
          )}
          ListFooterComponent={
            <View style={styles.footer}>
              <View style={styles.subtotal}>
                <AppText variant="label">Subtotal</AppText>
                <AppText>{money(subtotal)}</AppText>
              </View>
              <AppText variant="muted">Checkout is coming to the app soon — you can check out on the website.</AppText>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { gap: 16, paddingTop: 24 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    paddingLeft: 12,
    marginTop: 12,
  },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 12 },
  image: { width: 72, height: 96, backgroundColor: colors.surface },
  info: { flex: 1, gap: 6 },
  remove: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  footer: { gap: 8, borderTopWidth: 1, borderColor: colors.border, paddingTop: 16 },
  subtotal: { flexDirection: 'row', justifyContent: 'space-between' },
});
