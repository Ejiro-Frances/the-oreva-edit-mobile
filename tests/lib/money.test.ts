import { money } from '@/lib/money';

describe('money', () => {
  it('formats whole naira without decimals', () => {
    expect(money(2850000)).toBe('₦28,500');
  });
  it('keeps kobo when present', () => {
    expect(money(150)).toBe('₦1.50');
  });
});
