import { describe, expect, it } from 'vitest';
import { FakeErrorTrackingAdapter } from './errors.fake';
import { SentryErrorTrackingAdapter, parseSentryDsn } from './errors.sentry';

describe('parseSentryDsn', () => {
  it('splits a well-formed DSN into its ingest endpoint and key', () => {
    const parsed = parseSentryDsn('https://abc123@o12345.ingest.sentry.io/6789');

    expect(parsed).toEqual({
      endpoint: 'https://o12345.ingest.sentry.io/api/6789/store/',
      publicKey: 'abc123',
      projectId: '6789',
    });
  });

  describe('returns null rather than throwing', () => {
    // A typo in an environment variable must cost error reporting, never the ability to boot.
    it.each([
      ['not a url', 'nonsense'],
      ['no key', 'https://o12345.ingest.sentry.io/6789'],
      ['no project id', 'https://abc123@o12345.ingest.sentry.io'],
      ['empty', ''],
    ])('%s', (_label, dsn) => {
      expect(parseSentryDsn(dsn)).toBeNull();
    });
  });
});

describe('SentryErrorTrackingAdapter', () => {
  it('never throws when the ingest endpoint is unreachable', async () => {
    // The caller is already handling a failure. An exception from here would replace a handled
    // error with an unhandled one and lose the original — the thing actually worth knowing.
    const adapter = new SentryErrorTrackingAdapter({
      dsn: {
        endpoint: 'http://127.0.0.1:1/api/1/store/',
        publicKey: 'k',
        projectId: '1',
      },
    });

    await expect(adapter.capture(new Error('boom'))).resolves.toBeUndefined();
  });
});

describe('FakeErrorTrackingAdapter', () => {
  it('records the message, stack and context', async () => {
    const adapter = new FakeErrorTrackingAdapter();

    await adapter.capture(new Error('payout failed'), {
      source: 'admin/payouts',
      userId: 'user-1',
      tags: { host_id: 'host-9' },
    });

    const recorded = adapter.errors[0];
    expect(recorded?.message).toBe('payout failed');
    expect(recorded?.stack).toContain('payout failed');
    expect(recorded?.context.source).toBe('admin/payouts');
    expect(recorded?.context.tags).toEqual({ host_id: 'host-9' });
  });

  it('normalises a thrown non-Error', async () => {
    // `throw 'something'` and rejected promises carrying strings are common in vendor SDKs, and
    // a reporter that assumes `.message` exists loses exactly those.
    const adapter = new FakeErrorTrackingAdapter();

    await adapter.capture('a string was thrown');

    expect(adapter.errors[0]?.message).toBe('a string was thrown');
  });

  it('never throws on a null', async () => {
    const adapter = new FakeErrorTrackingAdapter();

    await expect(adapter.capture(null)).resolves.toBeUndefined();
    expect(adapter.errors[0]?.message).toBe('null');
  });
});
