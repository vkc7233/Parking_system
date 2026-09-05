import { describe, expect, it } from 'vitest';
import { generateBookingReference, issueAccessPass, verifyAccessPass } from '../access-pass';
import { ACCESS_PASS } from '@parking/config';

const SECRET = 'test-secret-not-used-in-production';

const booking = {
  id: '11111111-1111-4111-8111-111111111111',
  listingId: '22222222-2222-4222-8222-222222222222',
  startTime: new Date('2026-09-06T12:00:00Z'),
  endTime: new Date('2026-09-06T15:00:00Z'),
};

const DURING = new Date('2026-09-06T13:00:00Z');

describe('access pass (A5)', () => {
  it('verifies a genuine pass during the booking window', async () => {
    const token = await issueAccessPass(booking, SECRET);
    const result = await verifyAccessPass(token, SECRET, DURING);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.claims.bookingId).toBe(booking.id);
  });

  it('rejects a pass signed with a different secret', async () => {
    const token = await issueAccessPass(booking, SECRET);
    const result = await verifyAccessPass(token, 'attacker-secret', DURING);
    expect(result).toEqual({ valid: false, reason: 'bad_signature' });
  });

  it('rejects a tampered payload', async () => {
    const token = await issueAccessPass(booking, SECRET);
    const signature = token.split('.')[1];
    const forged = 'eyJib29raW5nSWQiOiJvdGhlciJ9.' + signature;
    const result = await verifyAccessPass(forged, SECRET, DURING);
    expect(result.valid).toBe(false);
  });

  it('rejects a pass presented too early', async () => {
    const token = await issueAccessPass(booking, SECRET);
    const wellBefore = new Date(
      booking.startTime.getTime() - (ACCESS_PASS.validFromMinutesBeforeStart + 5) * 60_000,
    );
    expect(await verifyAccessPass(token, SECRET, wellBefore)).toEqual({
      valid: false,
      reason: 'not_yet_valid',
    });
  });

  it('rejects a pass presented after the grace period', async () => {
    const token = await issueAccessPass(booking, SECRET);
    const wellAfter = new Date(
      booking.endTime.getTime() + (ACCESS_PASS.validUntilMinutesAfterEnd + 5) * 60_000,
    );
    expect(await verifyAccessPass(token, SECRET, wellAfter)).toEqual({
      valid: false,
      reason: 'expired',
    });
  });

  it('rejects a malformed token', async () => {
    expect(await verifyAccessPass('not-a-token', SECRET)).toEqual({
      valid: false,
      reason: 'malformed',
    });
  });
});

describe('generateBookingReference (A5)', () => {
  it('uses the configured length and a misread-resistant alphabet', () => {
    const ref = generateBookingReference();
    expect(ref).toHaveLength(ACCESS_PASS.referenceLength);
    expect(ref).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
    expect(ref).not.toMatch(/[IO01]/);
  });

  it('does not collide across a reasonable sample', () => {
    const refs = new Set(Array.from({ length: 2000 }, generateBookingReference));
    expect(refs.size).toBe(2000);
  });
});
