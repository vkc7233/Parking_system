import { describe, expect, it } from 'vitest';
import { formatPhoneForDisplay, parseIndianMobile } from '../phone';

describe('parseIndianMobile', () => {
  it('accepts a bare 10-digit number', () => {
    expect(parseIndianMobile('9876543210')).toEqual({
      national: '9876543210',
      e164: '+919876543210',
      stored: '919876543210',
    });
  });

  it('accepts the E.164 form the login form sends to Supabase Auth', () => {
    expect(parseIndianMobile('+919876543210')?.stored).toBe('919876543210');
  });

  it('accepts the stored form Supabase Auth returns on the session', () => {
    expect(parseIndianMobile('919876543210')?.e164).toBe('+919876543210');
  });

  it('tolerates spaces, dashes and brackets', () => {
    expect(parseIndianMobile(' +91 98765-43210 ')?.national).toBe('9876543210');
  });

  it('rejects numbers that are not Indian mobiles', () => {
    expect(parseIndianMobile('1234567890')).toBeNull();
    expect(parseIndianMobile('98765')).toBeNull();
    expect(parseIndianMobile('+14155552671')).toBeNull();
    expect(parseIndianMobile('')).toBeNull();
  });
});

describe('formatPhoneForDisplay', () => {
  it('renders both formats identically', () => {
    expect(formatPhoneForDisplay('919876543210')).toBe('+91 98765 43210');
    expect(formatPhoneForDisplay('+919876543210')).toBe('+91 98765 43210');
    expect(formatPhoneForDisplay('9876543210')).toBe('+91 98765 43210');
  });

  it('returns something safe for missing or unrecognised input', () => {
    expect(formatPhoneForDisplay(null)).toBe('');
    expect(formatPhoneForDisplay(undefined)).toBe('');
    expect(formatPhoneForDisplay('not a phone')).toBe('not a phone');
  });
});
