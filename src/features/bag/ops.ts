import type { BagView } from '@/lib/types';

export type BagOp =
  | { op: 'add' | 'set'; variantId: string; quantity: number }
  | { op: 'remove'; variantId: string };

const limit = (stock: number) => Math.max(0, Math.min(stock, 20));

/** What the bag shows while a change is on its way; new lines wait for the server. */
export function applyOptimistic(view: BagView, op: BagOp): BagView {
  if (op.op === 'remove') return { ...view, lines: view.lines.filter((l) => l.variantId !== op.variantId) };
  if (!view.lines.some((l) => l.variantId === op.variantId)) return view;
  return {
    ...view,
    lines: view.lines.map((l) =>
      l.variantId !== op.variantId
        ? l
        : { ...l, quantity: Math.min(op.op === 'add' ? l.quantity + op.quantity : op.quantity, limit(l.variant.stock)) },
    ),
  };
}
