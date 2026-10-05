import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Price } from '@/components/Price';
import { assetUrl } from '@/lib/config';
import { money } from '@/lib/money';
import type { ProductSummary } from '@/lib/types';

export function ProductCard({ product }: { product: ProductSummary }) {
  const { id, slug, name, price, compare_at, image, inStock } = product;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${money(price)}`}
      onPress={() => router.push({ pathname: '/product/[slug]', params: { slug } })}
      style={{ flex: 1, gap: 6 }}
    >
      <Image
        source={assetUrl(image)}
        style={{ width: '100%', aspectRatio: 3 / 4 }}
        contentFit="cover"
        transition={150}
        recyclingKey={id}
      />
      <View style={{ gap: 2 }}>
        <AppText>{name}</AppText>
        <Price amount={price} compareAt={compare_at} />
        {!inStock ? <AppText variant="muted">Sold out</AppText> : null}
      </View>
    </Pressable>
  );
}
