import { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ErrorState } from '@/components/ErrorState';
import { Notice } from '@/components/Notice';
import { Price } from '@/components/Price';
import { useToast } from '@/components/Toast';
import { colors } from '@/components/theme';
import { useBag } from '@/features/bag/provider';
import { useProduct } from '@/features/catalogue/queries';
import { initialSelection, selectOption, selectedVariant } from '@/features/catalogue/selection';
import { VariantPicker } from '@/features/catalogue/VariantPicker';
import { ApiError } from '@/lib/api';
import { assetUrl } from '@/lib/config';
import type { Product } from '@/lib/types';

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data: product, error, isLoading, refetch } = useProduct(slug);

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }
  if (error instanceof ApiError && error.status === 404) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 24 }}>
        <AppText variant="title">This piece is no longer available</AppText>
      </SafeAreaView>
    );
  }
  if (error || !product) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <ErrorState message={error?.message ?? 'Something went wrong'} onRetry={() => refetch()} />
      </SafeAreaView>
    );
  }
  return <ProductDetail product={product} />;
}

function ProductDetail({ product }: { product: Product }) {
  const [selection, setSelection] = useState(() => initialSelection(product));
  const variant = selectedVariant(product, selection.options);
  const { add, notice, clearNotice } = useBag();
  const toast = useToast();
  const [adding, setAdding] = useState(false);

  const addToBag = async () => {
    if (!variant) return;
    setAdding(true);
    clearNotice();
    try {
      // Failures and stock caps stay in the notice below; only a real addition is confirmed.
      if (await add(variant.id, 1))
        toast.show({
          message: 'Added to your bag',
          action: { label: 'View bag', onPress: () => router.navigate('/bag') },
        });
    } finally {
      setAdding(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
      <Image
        source={assetUrl(selection.image)}
        style={{ width: '100%', aspectRatio: 3 / 4 }}
        contentFit="cover"
        transition={150}
        accessibilityLabel={product.alt || product.name}
      />
      <View style={{ padding: 16, gap: 16 }}>
        <AppText variant="title">{product.name}</AppText>
        <Price
          amount={
            variant
              ? (variant.price ?? product.price)
              : Math.min(...product.variants.map((x) => x.price ?? product.price))
          }
          from={!variant}
          compareAt={product.compare_at}
        />
        {product.short_description ? <AppText>{product.short_description}</AppText> : null}
        <VariantPicker
          product={product}
          selected={selection.options}
          onChoose={(k, val) => setSelection((s) => selectOption(product, s, k, val))}
        />
        <AppText variant="muted">
          {!variant
            ? 'Choose your options'
            : variant.stock < 1
              ? 'This option is currently sold out.'
              : `${Object.values(variant.attributes).join(' / ')} — available`}
        </AppText>
        <Button
          title="Add to bag"
          loading={adding}
          disabled={!variant || variant.stock < 1}
          onPress={() => void addToBag()}
        />
        {notice ? <Notice message={notice} onClose={clearNotice} /> : null}
        {product.description ? <AppText>{product.description}</AppText> : null}
        {product.details.map((line) => (
          <AppText key={line}>{`• ${line}`}</AppText>
        ))}
        {product.care ? <AppText variant="muted">{product.care}</AppText> : null}
      </View>
    </ScrollView>
  );
}
