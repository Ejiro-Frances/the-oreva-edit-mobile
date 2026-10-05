import { applyGuestOp, applyOptimistic } from '@/features/bag/ops';
import type { BagView } from '@/lib/types';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';

describe('applyGuestOp', () => {
  it('adds, increments, sets and removes', () => {
    let lines = applyGuestOp([], { op: 'add', variantId: A, quantity: 1 }, 5).lines;
    lines = applyGuestOp(lines, { op: 'add', variantId: A, quantity: 2 }, 5).lines;
    expect(lines).toEqual([{ variantId: A, quantity: 3 }]);
    lines = applyGuestOp(lines, { op: 'set', variantId: A, quantity: 1 }, 5).lines;
    expect(lines).toEqual([{ variantId: A, quantity: 1 }]);
    expect(applyGuestOp(lines, { op: 'remove', variantId: A }, 5).lines).toEqual([]);
  });
  it('caps at stock and at 20, reporting the cap', () => {
    expect(applyGuestOp([], { op: 'add', variantId: A, quantity: 9 }, 4)).toEqual({
      lines: [{ variantId: A, quantity: 4 }],
      capped: true,
    });
    expect(applyGuestOp([{ variantId: A, quantity: 19 }], { op: 'add', variantId: A, quantity: 5 }, 99).lines).toEqual([
      { variantId: A, quantity: 20 },
    ]);
  });
  it('refuses a 51st line', () => {
    const full = Array.from({ length: 50 }, (_, i) => ({
      variantId: `00000000-0000-4000-8000-${String(100 + i).padStart(12, '0')}`,
      quantity: 1,
    }));
    expect(applyGuestOp(full, { op: 'add', variantId: B, quantity: 1 }, 5)).toEqual({ lines: full, capped: true });
  });
});

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
