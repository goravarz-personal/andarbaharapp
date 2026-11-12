/**
 * Phone numbers as the app shows and uses them.
 *
 * The server is the authority on what a valid number is - it normalises every
 * number to E.164 on the way in and sends back a message saying why one was
 * refused. This file deliberately does not re-implement those rules: a second
 * copy would drift, and the only thing a copy buys is finding out 300ms
 * sooner. What is here is the obviously-empty check, and formatting.
 */

/** Enough digits to be worth sending to the server. */
export function looksLikeANumber(input: string): boolean {
  return input.replace(/\D/g, '').length >= 8;
}

/** The digits a wa.me link wants: no plus, no spaces. */
export function toWhatsAppNumber(e164: string): string {
  return e164.replace(/\D/g, '');
}

/** "+91 98765 43210" - the stored number, spaced out to be read. */
export function displayPhone(e164: string | null): string {
  if (!e164) return '';
  const digits = toWhatsAppNumber(e164);

  // Indian numbers are the common case and group 5-5 after the country code.
  if (digits.startsWith('91') && digits.length === 12) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }

  // Everything else: the country code is not known, so keep it whole rather
  // than invent a grouping that is wrong for that country.
  return `+${digits}`;
}
