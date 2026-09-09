/**
 * Razorpay implementation of PaymentsAdapter (spec section 9.7).
 *
 * Written against the REST API with plain fetch rather than the Node SDK, so the same code
 * runs in a Next.js route handler and in a Supabase Edge Function (Deno) without a second
 * implementation. Amounts are paise throughout, which is also Razorpay's own unit - no
 * conversion, and therefore no rounding error, anywhere on this path.
 *
 * Not implemented here, deliberately: Razorpay Route / split settlements. Spec 4.2 defers
 * that to Phase 3, and `createPayout` below is the manual Admin-triggered batch payout the
 * MVP actually uses (spec 6.3).
 */
import {
  PaymentAdapterError,
  type BeneficiaryInput,
  type BeneficiaryResult,
  type CapturedPayment,
  type PaymentOrder,
  type PaymentsAdapter,
  type PayoutRequest,
  type PayoutResult,
  type RefundResult,
  type WebhookEvent,
} from './payments';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  /** Razorpay X account number, required for Payouts. Absent until Payouts is activated. */
  payoutAccountNumber?: string;
  apiBase?: string;
}

interface RazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
}

interface RazorpayPaymentResponse {
  id: string;
  order_id: string;
  amount: number;
  status: string;
  method?: string;
  created_at: number;
  error_description?: string;
}

interface RazorpayRefundResponse {
  id: string;
  amount: number;
  status: string;
}

interface RazorpayPayoutResponse {
  id: string;
  status: string;
  failure_reason?: string;
}

export class RazorpayPaymentsAdapter implements PaymentsAdapter {
  readonly name = 'razorpay';

  private readonly apiBase: string;
  private readonly authHeader: string;

  constructor(private readonly config: RazorpayConfig) {
    if (!config.keyId || !config.keySecret) {
      throw new PaymentAdapterError(
        'Razorpay adapter needs both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET',
        'provider_error',
      );
    }
    this.apiBase = config.apiBase ?? 'https://api.razorpay.com/v1';
    this.authHeader = `Basic ${btoa(`${config.keyId}:${config.keySecret}`)}`;
  }

  private async request<T>(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown; idempotencyKey?: string } = { method: 'GET' },
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      'Content-Type': 'application/json',
    };
    // Razorpay honours this on Payouts, which is what makes a retried payout safe.
    if (init.idempotencyKey) headers['X-Payout-Idempotency'] = init.idempotencyKey;

    const response = await fetch(`${this.apiBase}${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    const text = await response.text();

    if (!response.ok) {
      if (response.status === 404) {
        throw new PaymentAdapterError(`Razorpay resource not found: ${path}`, 'not_found');
      }
      throw new PaymentAdapterError(
        `Razorpay ${init.method} ${path} failed with ${response.status}: ${text}`,
        'provider_error',
      );
    }

    return JSON.parse(text) as T;
  }

  async createOrder(input: {
    amount: number;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<PaymentOrder> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new PaymentAdapterError(
        `Order amount must be a positive integer in paise, got ${input.amount}`,
        'provider_error',
      );
    }

    const order = await this.request<RazorpayOrderResponse>('/orders', {
      method: 'POST',
      body: {
        amount: input.amount,
        currency: 'INR',
        receipt: input.receipt,
        notes: input.notes,
        // Capture at authorisation: spec 7.1 wants the booking confirmed only on capture, and
        // a two-step auth/capture would leave a window where neither state is true.
        payment_capture: 1,
      },
    });

    return {
      orderId: order.id,
      amount: order.amount,
      currency: 'INR',
      receipt: order.receipt,
    };
  }

  async fetchPayment(paymentId: string): Promise<CapturedPayment | null> {
    let payment: RazorpayPaymentResponse;
    try {
      payment = await this.request<RazorpayPaymentResponse>(`/payments/${paymentId}`);
    } catch (error) {
      if (error instanceof PaymentAdapterError && error.code === 'not_found') return null;
      throw error;
    }

    // Anything short of 'captured' means the money is not ours yet, so the caller must not
    // confirm the booking (spec 7.1).
    if (payment.status !== 'captured') return null;

    return {
      paymentId: payment.id,
      orderId: payment.order_id,
      amount: payment.amount,
      method: payment.method ?? null,
      capturedAt: new Date(payment.created_at * 1000),
    };
  }

  async verifyWebhookSignature(
    rawBody: string,
    signature: string,
    secret: string,
  ): Promise<boolean> {
    const expected = await hmacHex(rawBody, secret);
    return timingSafeEqual(expected, signature);
  }

  parseWebhook(rawBody: string): WebhookEvent {
    const parsed = JSON.parse(rawBody) as {
      event?: string;
      payload?: {
        payment?: { entity?: RazorpayPaymentResponse };
        refund?: { entity?: RazorpayRefundResponse };
      };
    };

    const payment = parsed.payload?.payment?.entity;

    return {
      type: parsed.event ?? 'unknown',
      paymentId: payment?.id ?? null,
      orderId: payment?.order_id ?? null,
      amount: payment?.amount ?? null,
      raw: parsed,
    };
  }

  async refund(input: {
    paymentId: string;
    amount: number;
    notes?: Record<string, string>;
  }): Promise<RefundResult> {
    const refund = await this.request<RazorpayRefundResponse>(
      `/payments/${input.paymentId}/refund`,
      { method: 'POST', body: { amount: input.amount, notes: input.notes, speed: 'normal' } },
    );

    return {
      refundId: refund.id,
      amount: refund.amount,
      status:
        refund.status === 'processed'
          ? 'processed'
          : refund.status === 'failed'
            ? 'failed'
            : 'pending',
    };
  }

  /**
   * RazorpayX models a payee in two steps: a Contact (who they are) and a Fund Account (where
   * the money goes). A payout is made to the fund account id, never to a bank account directly,
   * which is why onboarding has to do this once rather than the payout run doing it each time.
   *
   * The IFSC is upper-cased and the account number stripped of spaces before sending: both are
   * routinely typed with the formatting people see on a passbook, and Razorpay rejects them.
   */
  async createBeneficiary(input: BeneficiaryInput): Promise<BeneficiaryResult> {
    const accountNumber = input.accountNumber.replace(/\s+/g, '');
    const ifsc = input.ifsc.replace(/\s+/g, '').toUpperCase();

    const contact = await this.request<{ id: string }>('/contacts', {
      method: 'POST',
      body: {
        name: input.accountHolderName,
        contact: input.phone,
        ...(input.email ? { email: input.email } : {}),
        type: 'vendor',
        // Lets support find the platform user from the Razorpay dashboard and back again.
        reference_id: input.hostId,
      },
    });

    const fundAccount = await this.request<{ id: string }>('/fund_accounts', {
      method: 'POST',
      body: {
        contact_id: contact.id,
        account_type: 'bank_account',
        bank_account: {
          name: input.accountHolderName,
          ifsc,
          account_number: accountNumber,
        },
      },
    });

    return {
      fundAccountId: fundAccount.id,
      contactId: contact.id,
      accountLast4: accountNumber.slice(-4),
    };
  }

  async createPayout(request: PayoutRequest): Promise<PayoutResult> {
    if (!this.config.payoutAccountNumber) {
      throw new PaymentAdapterError(
        'Razorpay Payouts is not configured (RAZORPAY_PAYOUT_ACCOUNT_NUMBER missing). ' +
          'Payouts activation is a separate approval from Checkout - see spec section 13.',
        'provider_error',
      );
    }

    const payout = await this.request<RazorpayPayoutResponse>('/payouts', {
      method: 'POST',
      // Our payout row id doubles as the idempotency key, so a retried admin click after a
      // network timeout cannot pay a host twice (spec 7.3 acceptance criterion).
      idempotencyKey: request.reference,
      body: {
        account_number: this.config.payoutAccountNumber,
        fund_account_id: request.beneficiaryId,
        amount: request.amount,
        currency: 'INR',
        mode: 'IMPS',
        purpose: 'payout',
        queue_if_low_balance: true,
        reference_id: request.reference,
        narration: request.narration ?? 'Parking host payout',
      },
    });

    const status: PayoutResult['status'] =
      payout.status === 'processed'
        ? 'processed'
        : payout.status === 'failed' || payout.status === 'reversed'
          ? 'failed'
          : payout.status === 'queued'
            ? 'queued'
            : 'processing';

    return {
      payoutId: payout.id,
      status,
      ...(payout.failure_reason ? { failureReason: payout.failure_reason } : {}),
    };
  }
}

async function hmacHex(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
