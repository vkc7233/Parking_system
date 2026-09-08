import 'server-only';

/**
 * Issuing and rendering the digital access pass (spec §7.1, assumption A5).
 *
 * The QR encodes an HMAC-signed token, not a booking id. That is the whole point: a pass has to
 * be checkable on arrival by a Host who is offline-ish and holding a phone, and a bare id would
 * be forgeable by anyone who can count. The signing secret never leaves the server, so only this
 * application can mint a pass and only this application can verify one.
 */
import QRCode from 'qrcode';
import { issueAccessPass, verifyAccessPass, type PassVerification } from '@parking/core';
import { getServerEnv } from '@/lib/env';

export interface IssuedPass {
  token: string;
  /** A data: URI, so the confirmation page needs no extra request to draw the code. */
  qrDataUrl: string;
}

export async function issuePassFor(booking: {
  id: string;
  listingId: string;
  startTime: Date;
  endTime: Date;
}): Promise<IssuedPass> {
  const token = await issueAccessPass(booking, getServerEnv().ACCESS_PASS_SECRET);

  const qrDataUrl = await QRCode.toDataURL(token, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
    color: { dark: '#0f172a', light: '#ffffff' },
  });

  return { token, qrDataUrl };
}

export async function verifyPass(token: string): Promise<PassVerification> {
  return verifyAccessPass(token.trim(), getServerEnv().ACCESS_PASS_SECRET);
}
