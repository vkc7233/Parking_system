/**
 * Transactional email (spec §7.1, §9.9).
 *
 * §7.1 asks for "SMS/WhatsApp + email" and §9.9 for "a standard transactional email provider",
 * deliberately not naming one. Email is kept behind this narrow interface rather than folded into
 * `NotificationsAdapter` because it genuinely is a different provider from MSG91 — the SMS and
 * WhatsApp channels come from one vendor account and email from another, and pretending otherwise
 * would make swapping either one touch the other.
 *
 * Callers never reach this directly. `NotificationsAdapter.send` still decides which channels an
 * event uses; this is what it hands the email channel to.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text. Every template body in this product is a sentence or two, not a newsletter. */
  text: string;
  replyTo?: string;
}

export interface EmailSendResult {
  providerMessageId?: string;
}

export interface EmailSender {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export class EmailAdapterError extends Error {
  constructor(
    message: string,
    readonly code: 'provider_error' | 'invalid_recipient',
  ) {
    super(message);
    this.name = 'EmailAdapterError';
  }
}

export interface ResendConfig {
  apiKey: string;
  /** e.g. 'Parking Marketplace <bookings@yourdomain.in>'. The domain must be verified at Resend. */
  from: string;
  replyTo?: string;
  apiBase?: string;
}

/**
 * Resend (https://resend.com) — one HTTPS POST, no SDK, no connection pool.
 *
 * Chosen over SMTP because this runs on serverless request handlers: an SMTP session is a
 * long-lived socket with a handshake, which is the wrong shape for a function that may be frozen
 * mid-send, and most platforms block outbound port 25/587 anyway. Any provider with a REST API
 * would do — that is the point of the interface above.
 */
export class ResendEmailSender implements EmailSender {
  readonly name = 'resend';
  private readonly apiBase: string;

  constructor(private readonly config: ResendConfig) {
    if (!config.apiKey) {
      throw new EmailAdapterError('RESEND_API_KEY is required', 'provider_error');
    }
    if (!config.from) {
      throw new EmailAdapterError('EMAIL_FROM is required', 'provider_error');
    }
    this.apiBase = config.apiBase ?? 'https://api.resend.com';
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (!message.to.includes('@')) {
      throw new EmailAdapterError(`Not an email address: ${message.to}`, 'invalid_recipient');
    }

    const response = await fetch(`${this.apiBase}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.config.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...((message.replyTo ?? this.config.replyTo)
          ? { reply_to: message.replyTo ?? this.config.replyTo }
          : {}),
      }),
    });

    const body = await response.text();

    if (!response.ok) {
      // The response body carries Resend's own reason — an unverified sending domain, a
      // suppressed address — and pasting it through is the difference between a support ticket
      // and a fix, since this text ends up in notification_log.
      throw new EmailAdapterError(
        `Resend responded ${response.status}: ${body || '(empty body)'}`,
        'provider_error',
      );
    }

    const parsed = body ? (JSON.parse(body) as { id?: string }) : {};
    return parsed.id ? { providerMessageId: parsed.id } : {};
  }
}

/** Test double: records what would have been sent and always succeeds. */
export class FakeEmailSender implements EmailSender {
  readonly name = 'fake';
  readonly sent: EmailMessage[] = [];
  private counter = 0;

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (!message.to.includes('@')) {
      throw new EmailAdapterError(`Not an email address: ${message.to}`, 'invalid_recipient');
    }
    this.sent.push(message);
    this.counter += 1;
    return { providerMessageId: `email_fake_${this.counter}` };
  }

  reset(): void {
    this.sent.length = 0;
    this.counter = 0;
  }
}
