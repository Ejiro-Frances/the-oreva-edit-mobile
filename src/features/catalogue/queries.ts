import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Category, Product, ProductSummary } from '@/lib/types';

type Page = { products: ProductSummary[]; page: number; pageSize: number; total: number };

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api<{ categories: Category[] }>('/api/catalogue/categories'),
    select: (data) => data.categories,
    staleTime: 5 * 60_000,
  });
}

export function useProducts(filters: { audience?: string; category?: string }) {
  return useInfiniteQuery({
    queryKey: ['products', filters],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ page: String(pageParam) });
      if (filters.audience) query.set('audience', filters.audience);
      if (filters.category) query.set('category', filters.category);
      return api<Page>(`/api/catalogue/products?${query}`);
    },
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
}

export function useProduct(slug: string) {
  return useQuery({
    queryKey: ['product', slug],
    queryFn: () => api<{ product: Product }>(`/api/catalogue/products/${encodeURIComponent(slug)}`),
    select: (data) => data.product,
  });
}
