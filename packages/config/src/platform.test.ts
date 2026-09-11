import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_SUPPORT_NUMBER, normaliseSupportNumber, supportWhatsAppUrl } from './platform';

/**
 * Spec §7.1: "a submitted query reaches Admin within 5 minutes".
 *
 * The link is one string, and every way it can be wrong is silent — it opens WhatsApp, the
 * message goes nowhere, and nobody finds out until a seeker with a problem does. These pin the
 * shapes a real person actually pastes into a hosting dashboard.
 */
describe('the support WhatsApp number', () => {
  it.each([
    ['+91 98220 11223', '919822011223'],
    ['+919822011223', '919822011223'],
    ['919822011223', '919822011223'],
    ['98220 11223', '919822011223'],
    ['9822011223', '919822011223'],
    ['+91-98220-11223', '919822011223'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normaliseSupportNumber(input)).toBe(expected);
  });

  it.each([undefined, '', '   ', 'not a number'])(
    'falls back to the placeholder for %p',
    (input) => {
      // Deliberate: the production boot check refuses the placeholder, so an unusable value
      // stops a deploy instead of shipping a link that opens an empty chat.
      expect(normaliseSupportNumber(input)).toBe(PLACEHOLDER_SUPPORT_NUMBER);
    },
  );

  it('builds a wa.me link with no punctuation left in it', () => {
    // wa.me silently fails on a number containing '+' or spaces, rather than erroring.
    const url = supportWhatsAppUrl('Hi');
    expect(url).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
  });
});
