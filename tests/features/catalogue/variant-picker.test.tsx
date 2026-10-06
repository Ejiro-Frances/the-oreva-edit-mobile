import { render, screen, userEvent } from '@testing-library/react-native';
import { VariantPicker } from '@/features/catalogue/VariantPicker';
import type { Product } from '@/lib/types';

const product = {
  id: 'p1', name: 'Shirt', slug: 'shirt', description: '', short_description: '', category: 'Shirts',
  audience: 'men', status: 'active', price: 1000, compare_at: null, images: [], alt: '', details: [], care: '',
  variants: [
    { id: 'a', sku: 'a', attributes: { Size: 'M' }, price: null, stock: 1 },
    { id: 'b', sku: 'b', attributes: { Size: 'L' }, price: null, stock: 0 },
  ],
} as Product;

it('labels sold-out options and reports a choice', async () => {
  const onChoose = jest.fn();
  const user = userEvent.setup();
  await render(<VariantPicker product={product} selected={{}} onChoose={onChoose} />);
  expect(screen.getByRole('button', { name: 'Size: L (sold out)' })).toBeDisabled();
  await user.press(screen.getByRole('button', { name: 'Size: M' }));
  expect(onChoose).toHaveBeenCalledWith('Size', 'M');
});
