/**
 * Money is integer paise everywhere in this codebase (see docs/ASSUMPTIONS.md, A9).
 * Never a float, never rupees, until the display edge.
 */
import { PLATFORM } from '@parking/config';

/** Integer paise. 1 rupee = 100 paise. */
export type Paise = number;

export function rupeesToPaise(rupees: number): Paise {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: Paise): number {
  return paise / 100;
}

/** Applies a basis-point rate to an amount, rounding half-up to the nearest paisa. */
export function applyBps(amount: Paise, bps: number): Paise {
  return Math.round((amount * bps) / 10_000);
}

/** Formats paise for display, e.g. 125_000 -> "₹1,250.00". */
export function formatPaise(paise: Paise, opts: { showDecimals?: boolean } = {}): string {
  const showDecimals = opts.showDecimals ?? true;
  return new Intl.NumberFormat(PLATFORM.locale, {
    style: 'currency',
    currency: PLATFORM.currency,
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(paiseToRupees(paise));
}

/** Guards against a non-integer or negative amount reaching the database or a payment call. */
export function assertValidAmount(paise: Paise, label = 'amount'): asserts paise is Paise {
  if (!Number.isInteger(paise)) {
    throw new Error(`${label} must be an integer number of paise, received ${paise}`);
  }
  if (paise < 0) {
    throw new Error(`${label} must not be negative, received ${paise}`);
  }
}
