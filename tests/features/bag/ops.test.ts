import { applyOptimistic } from '@/features/bag/ops';
import type { BagView } from '@/lib/types';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';

describe('applyOptimistic', () => {
  const line = (variantId: string, quantity: number, stock = 5) => ({
    variantId,
    quantity,
    product: { id: 'p', slug: 's', name: 'n', image: null, alt: '', price: 100 },
    variant: { attributes: {}, price: null, stock },
  });
  const view: BagView = { lines: [line(A, 2), line(B, 1)], wishlist: [] };
  it('sets and removes known lines immediately', () => {
    expect(applyOptimistic(view, { op: 'set', variantId: A, quantity: 4 }).lines[0].quantity).toBe(4);
    expect(applyOptimistic(view, { op: 'remove', variantId: B }).lines.map((l) => l.variantId)).toEqual([A]);
  });
  it('increments a known line on add and leaves unknown adds to the server', () => {
    expect(applyOptimistic(view, { op: 'add', variantId: A, quantity: 1 }).lines[0].quantity).toBe(3);
    expect(applyOptimistic(view, { op: 'add', variantId: 'other', quantity: 1 })).toEqual(view);
  });
});
