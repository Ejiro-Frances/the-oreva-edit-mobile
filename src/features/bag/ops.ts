import type { BagView, CartLine } from '@/lib/types';

export type BagOp =
  | { op: 'add' | 'set'; variantId: string; quantity: number }
  | { op: 'remove'; variantId: string };

const limit = (stock: number) => Math.max(0, Math.min(stock, 20));

/** Guest bag rules, matching the server: capped at stock and 20 per line, at most 50 lines. */
export function applyGuestOp(lines: CartLine[], op: BagOp, stock: number) {
  if (op.op === 'remove') return { lines: lines.filter((l) => l.variantId !== op.variantId), capped: false };
  const current = lines.find((l) => l.variantId === op.variantId);
  if (!current && lines.length >= 50) return { lines, capped: true };
  const wanted = op.op === 'add' ? (current?.quantity ?? 0) + op.quantity : op.quantity;
  const quantity = Math.min(wanted, limit(stock));
  const others = lines.filter((l) => l.variantId !== op.variantId);
  const next = quantity > 0 ? (current ? lines.map((l) => (l.variantId === op.variantId ? { ...l, quantity } : l)) : [...others, { variantId: op.variantId, quantity }]) : others;
  return { lines: next, capped: quantity !== wanted };
}

/** What the signed-in bag shows while a change is on its way; new lines wait for the server. */
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
