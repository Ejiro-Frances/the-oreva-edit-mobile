export function money(kobo: number) {
  // Set both bounds: NGN defaults to 2 minimum digits, and engines with pre-2023 Intl rules
  // (Hermes on some Androids) throw a RangeError when the maximum falls below the minimum.
  const digits = kobo % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(kobo / 100);
}
