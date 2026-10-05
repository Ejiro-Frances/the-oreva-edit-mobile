import { useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { ErrorState } from '@/components/ErrorState';
import { colors } from '@/components/theme';
import { AudienceFilter } from '@/features/catalogue/AudienceFilter';
import { ProductCard } from '@/features/catalogue/ProductCard';
import { useProducts } from '@/features/catalogue/queries';

export default function ShopScreen() {
  const [filters, setFilters] = useState<{ audience?: string; category?: string }>({});
  const { data, error, isLoading, isRefetching, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useProducts(filters);
  const products = data?.pages.flatMap((p) => p.products);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <AppText variant="display">The Oreva Edit</AppText>
      </View>
      <AudienceFilter {...filters} onChange={setFilters} />
      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        numColumns={2}
        renderItem={({ item }) => <ProductCard product={item} />}
        onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
        onEndReachedThreshold={0.5}
        refreshing={isRefetching}
        onRefresh={refetch}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ padding: 16, gap: 16 }}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.foreground} />
          ) : error ? (
            <ErrorState message={error.message} onRetry={() => refetch()} />
          ) : (
            <AppText variant="muted">Nothing here yet</AppText>
          )
        }
      />
    </SafeAreaView>
  );
}
