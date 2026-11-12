/**
 * Phone numbers, stored the one way WhatsApp can use them.
 *
 * A number typed as "98765 43210" is perfectly readable and completely useless
 * to a wa.me link, which wants a country code and nothing else: no plus, no
 * spaces, no brackets. So every number is normalised on the way in and stored
 * as E.164 ("+919876543210"). What the person typed is not kept - there is
 * only one right answer per number, and keeping both invites them to drift.
 */

/** Where the group plays. A bare 10-digit number is assumed to be Indian. */
export const DEFAULT_COUNTRY_CODE = '91';

/** E.164 allows 15 digits at most, and nothing real is shorter than 8. */
const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

/**
 * Turns whatever was typed into E.164, or null if it cannot be one.
 *
 * Accepts the shapes people actually type: +91 98765 43210, 0091-98765-43210,
 * (98765) 43210, 9876543210.
 */
export function normalizePhone(
  input: string,
  defaultCountryCode: string = DEFAULT_COUNTRY_CODE,
): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  // Anything that is not a digit or a leading plus is punctuation people add
  // for readability. A plus anywhere but the front is a typo, not a hint.
  const hadPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits === '') return null;

  let withCountry: string;
  if (hadPlus) {
    withCountry = digits;
  } else if (digits.startsWith('00')) {
    // 00 is the other way of writing +, used across most of Europe and Asia.
    withCountry = digits.slice(2);
  } else if (digits.length === 10) {
    // A local number. Only a 10-digit one is safe to assume: anything else
    // might already carry a country code and would end up with two.
    withCountry = `${defaultCountryCode}${digits}`;
  } else {
    withCountry = digits;
  }

  if (withCountry.length < MIN_DIGITS || withCountry.length > MAX_DIGITS) return null;
  // No country code starts with zero, so one here means the whole number is
  // shifted along by a stray digit.
  if (withCountry.startsWith('0')) return null;
  if (!isPlausibleIndianNumber(withCountry)) return null;

  return `+${withCountry}`;
}

/**
 * The one country-specific check worth making here.
 *
 * Validating numbers properly means libphonenumber and its rules for every
 * country, which is far more than this needs - and over-validating is the
 * worse failure, because a number this refuses locks that person out of the
 * app entirely. So everything else is let through on length alone and
 * WhatsApp can be the judge of whether it rings.
 *
 * India is the exception because it is where the group plays, which makes
 * "+91" followed by a number still carrying its trunk zero the one typo they
 * will actually make.
 */
function isPlausibleIndianNumber(digits: string): boolean {
  // Every country code beginning with 9 is two digits (90 Turkey, 91 India,
  // 92 Pakistan ...), so a number starting "91" is Indian and nothing else.
  if (!digits.startsWith('91')) return true;
  const subscriber = digits.slice(2);
  // Indian numbers are ten digits, and mobiles - the only kind WhatsApp
  // rings - start 6 to 9.
  return subscriber.length === 10 && /^[6-9]/.test(subscriber);
}

/** The digits a wa.me link wants: E.164 without the plus. */
export function toWhatsAppNumber(e164: string): string {
  return e164.replace(/\D/g, '');
}
