import { isAvailable, selectOption, selectedVariant, initialSelection } from '@/features/catalogue/selection';
import type { Product } from '@/lib/types';

const v = (id: string, Colour: string, Size: string, stock: number, image: string | null = null) => ({
  id, sku: id, attributes: { Colour, Size }, price: null, stock, image,
});
const product: Product = {
  id: 'p1', name: 'Linen shirt', slug: 'linen-shirt', description: '', short_description: '',
  category: 'Shirts', audience: 'men', status: 'active', price: 2850000, compare_at: null,
  images: ['/images/shirt.jpg'], alt: 'Shirt', details: [], care: '',
  variants: [
    v('a', 'Ecru', 'M', 3, '/images/ecru.jpg'),
    v('b', 'Ecru', 'L', 0),
    v('c', 'Olive', 'M', 2, '/images/olive.jpg'),
  ],
};

describe('selection', () => {
  it('finds the variant once every option is chosen', () => {
    const s = selectOption(product, selectOption(product, initialSelection(product), 'Colour', 'Ecru'), 'Size', 'M');
    expect(selectedVariant(product, s.options)?.id).toBe('a');
  });
  it('marks sold-out sizes unavailable for the chosen colour', () => {
    expect(isAvailable(product, 'Size', 'L', { Colour: 'Ecru' })).toBe(false);
    expect(isAvailable(product, 'Size', 'M', { Colour: 'Ecru' })).toBe(true);
  });
  it('keeps colours browsable and drops an incompatible size', () => {
    const s = selectOption(product, { options: { Colour: 'Ecru', Size: 'M' }, image: '', quantity: 1 }, 'Colour', 'Olive');
    expect(s.options).toEqual({ Colour: 'Olive', Size: 'M' });
    expect(s.image).toBe('/images/olive.jpg');
  });
});
