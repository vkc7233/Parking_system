import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailAdapterError, FakeEmailSender, ResendEmailSender } from './email';
import { Msg91NotificationsAdapter } from './notifications.msg91';
import {
  TEMPLATE_BODIES,
  TEMPLATE_CHANNELS,
  TEMPLATE_SUBJECTS,
  renderSubject,
  type NotificationTemplate,
} from './notifications';

/**
 * Spec §7.1 asks for "SMS/WhatsApp + email" and §9.9 for a standard transactional email
 * provider. These pin the parts that are easy to get silently wrong: an email channel that
 * reports success without sending, and a template that has a body but no subject.
 */

const RECIPIENT = {
  userId: 'u1',
  phone: '+919000000001',
  email: 'seeker@example.com',
  name: 'Asha',
};

const VARIABLES = {
  listing: 'Covered bay off FC Road',
  start: 'Tue 10:00',
  reference: 'PK-ABC123',
  amount: '₹240.00',
  reason: 'Photos are too dark',
};

function adapter(email?: FakeEmailSender) {
  return new Msg91NotificationsAdapter({
    authKey: 'test-key',
    senderId: 'PARKNG',
    otpTemplateId: 'otp-1',
    smsTemplateIds: {},
    ...(email ? { email } : {}),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('email templates', () => {
  const templates = Object.keys(TEMPLATE_BODIES) as NotificationTemplate[];

  it.each(templates)('%s has a subject as well as a body', (template) => {
    expect(TEMPLATE_SUBJECTS[template]).toBeTruthy();
  });

  it('leaves every subject placeholder filled for the variables a caller passes', () => {
    for (const template of templates) {
      const subject = renderSubject(template, VARIABLES);
      // An unresolved placeholder is rendered literally rather than blanked, so it is visible
      // here - which is the point: a subject reading "Parking confirmed - {{reference}}" is
      // worse than one with a missing word, and this is where it gets caught.
      expect(subject, `${template} subject`).not.toMatch(/\{\{\w+\}\}/);
    }
  });

  it('sends email for every template whose channel list includes it', async () => {
    const email = new FakeEmailSender();
    const emailTemplates = templates.filter((t) => TEMPLATE_CHANNELS[t].includes('email'));

    expect(emailTemplates.length).toBeGreaterThan(0);

    for (const template of emailTemplates) {
      await adapter(email).send({
        recipient: RECIPIENT,
        template,
        variables: VARIABLES,
        channels: ['email'],
      });
    }

    expect(email.sent).toHaveLength(emailTemplates.length);
    expect(email.sent.every((m) => m.to === RECIPIENT.email)).toBe(true);
  });
});

describe('the email channel when it cannot send', () => {
  it('fails rather than reporting a delivery when no provider is configured', async () => {
    const result = await adapter().send({
      recipient: RECIPIENT,
      template: 'booking_confirmed',
      variables: VARIABLES,
      channels: ['email'],
    });

    expect(result.results[0]?.status).toBe('failed');
    expect(result.results[0]?.error).toMatch(/not configured/i);
    expect(result.delivered).toBe(false);
  });

  it('fails the channel when the account has no email address', async () => {
    const email = new FakeEmailSender();

    const result = await adapter(email).send({
      recipient: { ...RECIPIENT, email: null },
      template: 'booking_confirmed',
      variables: VARIABLES,
      channels: ['email'],
    });

    expect(result.results[0]?.status).toBe('failed');
    expect(email.sent).toHaveLength(0);
  });

  it('does not stop the other channels', async () => {
    // Signing up is by phone and the email address is optional, so a recipient with no address
    // is ordinary. §7.1 wants the confirmation to arrive; SMS carries it.
    const sms = adapter();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ request_id: 'req_1' }), { status: 200 })),
    );

    const result = await new Msg91NotificationsAdapter({
      authKey: 'test-key',
      senderId: 'PARKNG',
      otpTemplateId: 'otp-1',
      smsTemplateIds: { booking_confirmed: 'dlt-1' },
    }).send({
      recipient: { ...RECIPIENT, email: null },
      template: 'booking_confirmed',
      variables: VARIABLES,
      channels: ['sms', 'email'],
    });

    expect(result.delivered).toBe(true);
    expect(result.results.find((r) => r.channel === 'sms')?.status).toBe('sent');
    expect(result.results.find((r) => r.channel === 'email')?.status).toBe('failed');
    expect(sms.name).toBe('msg91');
  });
});

describe('ResendEmailSender', () => {
  it('refuses to construct without a key or a from address', () => {
    expect(() => new ResendEmailSender({ apiKey: '', from: 'a@b.in' })).toThrow(EmailAdapterError);
    expect(() => new ResendEmailSender({ apiKey: 'k', from: '' })).toThrow(EmailAdapterError);
  });

  it('posts the message and returns the provider id', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ id: 'resend_1' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const sender = new ResendEmailSender({
      apiKey: 'k',
      from: 'Parking <bookings@example.in>',
      replyTo: 'help@example.in',
    });

    const result = await sender.send({
      to: 'seeker@example.com',
      subject: 'Parking confirmed - PK-ABC123',
      text: 'Body',
    });

    expect(result.providerMessageId).toBe('resend_1');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer k');

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body['to']).toEqual(['seeker@example.com']);
    expect(body['reply_to']).toBe('help@example.in');
  });

  it("carries the provider's own reason into the error, since it lands in the log", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'The domain is not verified' }), { status: 403 }),
      ),
    );

    const sender = new ResendEmailSender({ apiKey: 'k', from: 'Parking <a@example.in>' });

    await expect(
      sender.send({ to: 'seeker@example.com', subject: 's', text: 't' }),
    ).rejects.toThrow(/domain is not verified/);
  });
});
