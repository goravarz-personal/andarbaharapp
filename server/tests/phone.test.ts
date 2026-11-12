import { describe, expect, it } from 'vitest';
import { normalizePhone, toWhatsAppNumber } from '../src/lib/phone';

describe('normalizePhone', () => {
  it('takes the shapes people actually type', () => {
    // All the same number, however it was written down.
    for (const typed of [
      '+919876543210',
      '+91 98765 43210',
      '+91-98765-43210',
      '0091 98765 43210',
      '9876543210',
      '98765 43210',
      '(98765) 43210',
      ' 98765-43210 ',
    ]) {
      expect(normalizePhone(typed), typed).toBe('+919876543210');
    }
  });

  it('keeps a country code that is already there rather than adding another', () => {
    expect(normalizePhone('+14155552671')).toBe('+14155552671');
    expect(normalizePhone('+44 7700 900123')).toBe('+447700900123');
    // 11 digits with no plus is not a local number, so nothing is prepended.
    expect(normalizePhone('14155552671')).toBe('+14155552671');
  });

  it('only assumes the local country code for a bare ten-digit number', () => {
    expect(normalizePhone('9876543210')).toBe('+919876543210');
    expect(normalizePhone('9876543210', '44')).toBe('+449876543210');
  });

  it('refuses what is not a phone number', () => {
    for (const bad of ['', '   ', 'call me', '12345', '+', '-', '98765432109876543210']) {
      expect(normalizePhone(bad), bad).toBeNull();
    }
  });

  it('refuses an Indian number still carrying its trunk zero', () => {
    // "+91 098765..." is someone pasting a local number after a country code.
    expect(normalizePhone('+910987654321')).toBeNull();
    expect(normalizePhone('+91 098765 43210')).toBeNull();
    // Indian mobiles start 6-9; a landline-shaped one is not a mobile.
    expect(normalizePhone('+912212345678')).toBeNull();
  });

  it('leaves other countries alone rather than guessing their rules', () => {
    // Refusing a number locks that person out of the app, so everything
    // outside India passes on length and lets WhatsApp be the judge.
    expect(normalizePhone('+12125550123')).toBe('+12125550123');
    expect(normalizePhone('+6591234567')).toBe('+6591234567');
  });

  it('is idempotent, so storing a stored number changes nothing', () => {
    const once = normalizePhone('98765 43210');
    expect(once).not.toBeNull();
    expect(normalizePhone(once as string)).toBe(once);
  });
});

describe('toWhatsAppNumber', () => {
  it('strips the plus, which a wa.me link will not take', () => {
    expect(toWhatsAppNumber('+919876543210')).toBe('919876543210');
  });
});
