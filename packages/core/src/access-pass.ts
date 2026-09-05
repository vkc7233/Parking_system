/**
 * Digital access pass (assumption A5).
 *
 * The pass a Seeker receives is an HMAC-signed token, not a bare booking id, so a valid pass
 * cannot be produced by guessing a reference. The Host's Verify Pass screen calls
 * `verifyAccessPass` server-side; the secret never reaches a browser.
 *
 * Uses Web Crypto so the same code runs in Next.js server routes, Supabase Edge Functions
 * (Deno), and — later — React Native.
 */
import { ACCESS_PASS } from '@parking/config';

export interface AccessPassClaims {
  bookingId: string;
  listingId: string;
  /** Unix seconds. Pass is invalid before this. */
  nbf: number;
  /** Unix seconds. Pass is invalid after this. */
  exp: number;
}

export type PassVerification =
  | { valid: true; claims: AccessPassClaims }
  | { valid: false; reason: 'malformed' | 'bad_signature' | 'not_yet_valid' | 'expired' };

const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

/** Comparison that does not leak how much of the signature matched. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Builds the token encoded into the Seeker's QR code. */
export async function issueAccessPass(
  booking: { id: string; listingId: string; startTime: Date; endTime: Date },
  secret: string,
): Promise<string> {
  const claims: AccessPassClaims = {
    bookingId: booking.id,
    listingId: booking.listingId,
    nbf: Math.floor(
      (booking.startTime.getTime() - ACCESS_PASS.validFromMinutesBeforeStart * 60_000) / 1000,
    ),
    exp: Math.floor(
      (booking.endTime.getTime() + ACCESS_PASS.validUntilMinutesAfterEnd * 60_000) / 1000,
    ),
  };

  const payload = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifyAccessPass(
  token: string,
  secret: string,
  now: Date = new Date(),
): Promise<PassVerification> {
  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false, reason: 'malformed' };
  const [payload, signature] = parts as [string, string];

  if (!timingSafeEqual(signature, await sign(payload, secret))) {
    return { valid: false, reason: 'bad_signature' };
  }

  let claims: AccessPassClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
  } catch {
    return { valid: false, reason: 'malformed' };
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (nowSeconds < claims.nbf) return { valid: false, reason: 'not_yet_valid' };
  if (nowSeconds > claims.exp) return { valid: false, reason: 'expired' };

  return { valid: true, claims };
}

/**
 * Human-typable booking reference, for when a QR will not scan. Drawn from a crypto RNG and
 * an alphabet with no I/O/0/1, so it survives being read aloud or copied by hand.
 * Uniqueness is guaranteed by a unique constraint on the column, not by this function.
 */
export function generateBookingReference(): string {
  const { referenceLength, referenceAlphabet } = ACCESS_PASS;
  const bytes = crypto.getRandomValues(new Uint8Array(referenceLength));
  return Array.from(bytes, (b) => referenceAlphabet[b % referenceAlphabet.length]).join('');
}
