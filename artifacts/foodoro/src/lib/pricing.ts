/**
 * Tax-inclusive pricing helpers.
 *
 * Convention: Every product `price` stored in the DB is the *displayed* sticker
 * price the customer pays — VAT is ALREADY included in that number.
 * When we render an invoice, we break it down into:
 *   - subtotalExcl: the base amount (price without VAT)
 *   - tax        : the VAT portion (15% of the base)
 *   - total      : the full amount the customer pays (= subtotalExcl + tax)
 *
 * Example for a product priced at 3.00 SAR (15% VAT included):
 *   subtotalExcl = 2.61
 *   tax          = 0.39
 *   total        = 3.00
 */
const TAX_RATE = 0.15;
const TAX_DIVISOR = 1 + TAX_RATE;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function getBasePrice(displayPrice: number): number {
  return round2(displayPrice / TAX_DIVISOR);
}

export function getTaxAmount(displayPrice: number): number {
  return round2(displayPrice - displayPrice / TAX_DIVISOR);
}

export function getFinalPrice(displayPrice: number): number {
  return round2(displayPrice);
}

/**
 * @param rawSubtotal sum of (displayed sticker prices × quantity) — VAT-inclusive
 * @param discount    amount to subtract from the gross total (VAT-inclusive)
 */
export function calcOrderTotals(rawSubtotal: number, discount: number) {
  const grossAfterDiscount = Math.max(0, rawSubtotal - discount);
  const subtotalExcl = round2(grossAfterDiscount / TAX_DIVISOR);
  const total = round2(grossAfterDiscount);
  const tax = round2(total - subtotalExcl);
  return {
    /** Base amount BEFORE VAT (what we want to show as "Subtotal" on the invoice). */
    subtotal: subtotalExcl,
    /** Discount applied (VAT-inclusive). */
    discount: round2(discount),
    /** VAT portion of the total. */
    tax,
    /** Final amount the customer pays (VAT-inclusive). */
    total,
  };
}
