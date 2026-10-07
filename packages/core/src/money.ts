import type { Lisente } from './types';

/**
 * Parse a typed amount into lisente. Accepts "500", "500.5", "M500", "R 1,200.50".
 * Rand circulates at par with the Loti, so an "R" prefix is recorded as Maloti.
 * Returns null for anything that is not a positive amount with at most 2 decimals.
 */
export function parseAmount(input: string): Lisente | null {
  const cleaned = input.trim().replace(/^(M|R|LSL|ZAR)\s*/i, '').replace(/[\s,]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const value = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

/** "M1,200" or "M1,200.50"; negative values as "−M300". */
export function formatMaloti(amount: Lisente): string {
  const sign = amount < 0 ? '−' : '';
  const abs = Math.abs(amount);
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}M${grouped}${cents ? `.${String(cents).padStart(2, '0')}` : ''}`;
}

/** Input-field form: "1200" or "1200.50". */
export function toInputString(amount: Lisente): string {
  const whole = Math.floor(amount / 100);
  const cents = amount % 100;
  return cents ? `${whole}.${String(cents).padStart(2, '0')}` : String(whole);
}

export function halfOf(amount: Lisente): Lisente {
  return Math.round(amount / 2);
}
