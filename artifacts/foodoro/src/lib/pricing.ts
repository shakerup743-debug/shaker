const TAX_RATE = 0.15;
const TAX_DIVISOR = 1 + TAX_RATE;

export function getBasePrice(displayPrice: number): number {
  return Math.round((displayPrice / TAX_DIVISOR) * 100) / 100;
}

export function getTaxAmount(displayPrice: number): number {
  return Math.round((displayPrice - displayPrice / TAX_DIVISOR) * 100) / 100;
}

export function getFinalPrice(displayPrice: number): number {
  return Math.round(displayPrice * 100) / 100;
}

export function calcOrderTotals(subtotal: number, discount: number) {
  const afterDiscount = Math.max(0, subtotal - discount);
  const tax = Math.round((afterDiscount * (TAX_RATE / TAX_DIVISOR)) * 100) / 100;
  const total = Math.round(afterDiscount * 100) / 100;
  return { subtotal, discount, tax, total };
}
