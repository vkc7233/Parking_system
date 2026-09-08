import { describe, expect, it } from 'vitest';
import { csvField, rupees, toCsv } from '../csv';

describe('csvField', () => {
  it('leaves an ordinary value alone', () => {
    expect(csvField('Koregaon Park')).toBe('Koregaon Park');
    expect(csvField(42)).toBe('42');
  });

  it('renders null and undefined as an empty field, not as the words', () => {
    // A listing with no locality must produce an empty column, not the literal text "null" —
    // which a spreadsheet would happily sort and filter on.
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });

  it('quotes a value containing a comma', () => {
    // Real Pune addresses look exactly like this, so getting it wrong shifts every later column.
    expect(csvField('Clover Centre, Moledina Road, Camp')).toBe(
      '"Clover Centre, Moledina Road, Camp"',
    );
  });

  it('doubles internal quotes, per RFC 4180', () => {
    expect(csvField('Bay "A"')).toBe('"Bay ""A"""');
  });

  it('quotes a value containing a newline', () => {
    expect(csvField('Line one\nLine two')).toBe('"Line one\nLine two"');
  });

  describe('spreadsheet formula injection', () => {
    // Listing titles and dispute reasons are written by users. Without this, an export is a
    // path from someone typing into a form to code executing on the machine of whoever opens
    // the report in Excel or Sheets.
    it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])('neutralises %j', (value) => {
      expect(csvField(value).replace(/^"|"$/g, '').startsWith("'")).toBe(true);
    });

    it('neutralises the classic remote-command payload', () => {
      // It contains no comma, quote or newline, so RFC 4180 quoting never applies — the
      // apostrophe is the entire defence here, and it has to be the first character to work.
      const field = csvField("=cmd|' /C calc'!A0");

      expect(field).toBe("'=cmd|' /C calc'!A0");
    });

    it('does not mangle a negative number that is meant to be one', () => {
      // A refund column can legitimately hold "-103.50". It is still prefixed, because a
      // spreadsheet treats a leading "-" as a formula start regardless of intent — so the
      // guard applies, and the report shows refunds as positive amounts in their own column.
      expect(csvField('-103.50')).toBe("'-103.50");
    });
  });
});

describe('toCsv', () => {
  const columns = [
    { key: 'reference' as const, header: 'Reference' },
    { key: 'listing' as const, header: 'Listing' },
  ];

  it('writes a header row followed by the data', () => {
    const csv = toCsv(columns, [{ reference: 'D5FJB26A', listing: 'Covered bay' }]);

    expect(csv).toBe('Reference,Listing\r\nD5FJB26A,Covered bay\r\n');
  });

  it('uses CRLF, which is what Excel on Windows expects', () => {
    const csv = toCsv(columns, [{ reference: 'A', listing: 'B' }]);

    expect(csv.split('\r\n')).toHaveLength(3);
  });

  it('writes a header even when there are no rows', () => {
    // An empty range must still produce a readable file. A zero-byte download reads as a broken
    // feature; a file with headers and no rows reads as "nothing happened in that period".
    expect(toCsv(columns, [])).toBe('Reference,Listing\r\n');
  });
});

describe('rupees', () => {
  it('renders paise as a plain decimal a spreadsheet reads as a number', () => {
    // No symbol and no thousands separator: "₹1,234.00" is text to Excel and cannot be summed,
    // which defeats the point of exporting it.
    expect(rupees(123_400)).toBe('1234.00');
    expect(rupees(0)).toBe('0.00');
    expect(rupees(10_350)).toBe('103.50');
  });

  it('accepts the string Postgres returns for a bigint', () => {
    expect(rupees('17250')).toBe('172.50');
  });

  it('renders null as empty rather than as zero', () => {
    // "no refund recorded" and "refunded ₹0.00" are different facts about a booking.
    expect(rupees(null)).toBe('');
  });
});
