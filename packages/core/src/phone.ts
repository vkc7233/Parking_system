/**
 * Indian mobile number handling (spec 7.1 - phone-OTP is the only credential).
 *
 * There are two formats in play and confusing them is expensive:
 *
 *   - What we SEND to Supabase Auth: E.164 with the plus, `+919876543210`.
 *   - What Supabase Auth STORES and returns on the session: no plus, `919876543210`.
 *
 * Seeding a phone number in the stored format is what makes a seeded account reachable. Seed it
 * with the plus and the first real login does not match it - it silently creates a second,
 * empty account instead, which is exactly the bug this module exists to stop recurring.
 */

/** 10 digits starting 6-9, optionally already carrying a 91 or +91 country code. */
const INDIAN_MOBILE = /^(?:\+?91)?([6-9]\d{9})$/;

export interface ParsedPhone {
  /** Bare 10-digit national number, e.g. `9876543210`. */
  national: string;
  /** What to send to Supabase Auth: `+919876543210`. */
  e164: string;
  /** What Supabase Auth stores and returns: `919876543210`. */
  stored: string;
}

/** Returns null rather than throwing, so form validation can own the message. */
export function parseIndianMobile(input: string): ParsedPhone | null {
  const cleaned = input.trim().replace(/[\s()-]/g, '');
  const match = INDIAN_MOBILE.exec(cleaned);
  if (!match) return null;

  const national = match[1] as string;
  return { national, e164: `+91${national}`, stored: `91${national}` };
}

/**
 * Formats a number for display as `+91 98765 43210`.
 *
 * Accepts either format, because the login form holds the E.164 value while the session
 * carries the stored one, and both end up on screen.
 */
export function formatPhoneForDisplay(phone: string | null | undefined): string {
  if (!phone) return '';

  const parsed = parseIndianMobile(phone);
  if (!parsed) return phone;

  return `+91 ${parsed.national.slice(0, 5)} ${parsed.national.slice(5)}`;
}
