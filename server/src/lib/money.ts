/**
 * Money helpers. Everything inside the app is an integer count of minor units
 * (paise). Only the display layer knows about decimals.
 */

/** 100 paise to the rupee. */
export const MINOR_UNITS_PER_MAJOR = 100;

export function toMinor(major: number): number {
  return Math.round(major * MINOR_UNITS_PER_MAJOR);
}

export function toMajor(minor: number): number {
  return minor / MINOR_UNITS_PER_MAJOR;
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Split `amount` across `count` people as evenly as whole minor units allow.
 * The remainder goes one unit at a time to the earliest people in the list, so
 * the shares always add back up to `amount` exactly.
 */
export function splitEvenly(amount: number, count: number): number[] {
  if (count <= 0) return [];
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const base = Math.floor(abs / count);
  const remainder = abs - base * count;
  const shares = Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
  return negative ? shares.map((share) => -share) : shares;
}
