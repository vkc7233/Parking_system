/**
 * CSV generation for the operational export (spec §7.3).
 *
 * In `core` rather than beside the route because the escaping rules are the part worth testing,
 * and `core` is where the test runner lives. They are also framework-free: the Phase 2 mobile
 * app and any future scheduled report share them.
 */

/**
 * Escapes one CSV field.
 *
 * Two separate concerns are handled here, and the second is the one that matters:
 *
 * RFC 4180 quoting — a field containing a comma, quote or newline is wrapped in quotes with
 * internal quotes doubled. A Pune address line reads "Clover Centre, Moledina Road, Camp", so
 * this is not a rare case; without it every such row shifts its columns.
 *
 * Formula injection — a field starting with `=`, `+`, `-`, `@`, tab or carriage return is
 * executed as a formula when the file is opened in Excel or Sheets. Listing titles and dispute
 * reasons are written by users, so an export of them is a path from someone typing into a form
 * to code running on the machine of whoever opens the report. Prefixing a single quote makes the
 * spreadsheet treat it as text.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';

  let text = String(value);

  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

/** Renders rows as CSV, with a header line taken from the column list. */
export function toCsv<T extends Record<string, unknown>>(
  columns: { key: keyof T & string; header: string }[],
  rows: T[],
): string {
  const lines = [columns.map((c) => csvField(c.header)).join(',')];

  for (const row of rows) {
    lines.push(columns.map((c) => csvField(row[c.key])).join(','));
  }

  // CRLF per RFC 4180: Excel on Windows is the overwhelmingly likely reader, and it is the one
  // that mangles bare LF.
  return lines.join('\r\n') + '\r\n';
}

/** Paise as a plain rupee decimal — no symbol, no separators, so a spreadsheet reads it as a number. */
export function rupees(paise: number | string | null): string {
  if (paise === null) return '';
  return (Number(paise) / 100).toFixed(2);
}
