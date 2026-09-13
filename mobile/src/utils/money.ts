/**
 * Amounts travel as whole paise. Only this file turns them into something a
 * person reads.
 */

/** 12,34,567 - the way amounts are grouped in India. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
}

export interface MoneyOptions {
  /** Always show + or -, for anything that is a gain or a loss. */
  signed?: boolean;
  /** Drop the currency symbol. */
  bare?: boolean;
}

export function formatMoney(paise: number, options: MoneyOptions = {}): string {
  const negative = paise < 0;
  const absolute = Math.abs(Math.round(paise));
  const rupees = Math.floor(absolute / 100);
  const remainder = absolute % 100;

  // Whole rupees read cleaner without a trailing .00.
  const amount =
    remainder === 0
      ? groupIndian(String(rupees))
      : `${groupIndian(String(rupees))}.${String(remainder).padStart(2, '0')}`;

  const symbol = options.bare ? '' : '₹';
  const sign = negative ? '-' : options.signed ? '+' : '';
  return `${sign}${symbol}${amount}`;
}

/** What the user typed in a rupee field, back into paise. */
export function parseRupees(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, '').trim();
  if (cleaned === '') return 0;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Paise back into the plain number a rupee input should show. */
export function toRupeeInput(paise: number): string {
  if (paise === 0) return '';
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}
