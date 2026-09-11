/**
 * In-memory payments adapter for local development and tests.
 *
 * It is a real implementation of the contract, not a stub that returns undefined: orders are
 * tracked, refunds decrement the captured amount, signatures are genuinely HMAC-verified, and
 * failure can be provoked deterministically. That means the booking loop built against it
 * exercises the same code paths the Razorpay adapter will.
 *
 * Provoking failures: an amount ending in 13 paise fails capture, and one ending in 07 paise
 * reports the payout as failed. Handy for QA (spec section 15 puts QA on the payment loop
 * specifically) without needing provider-side test hooks.
 */
import {
  PaymentAdapterError,
  type CapturedPayment,
  type PaymentOrder,
  type PaymentsAdapter,
  type PayoutRequest,
  type PayoutResult,
  type RefundResult,
  type WebhookEvent,
} from './payments';

interface FakeOrder {
  order: PaymentOrder;
  payment?: CapturedPayment;
  refunded: number;
}

const FAIL_CAPTURE_SUFFIX = 13;
const FAIL_PAYOUT_SUFFIX = 7;

export class FakePaymentsAdapter implements PaymentsAdapter {
  readonly name = 'fake';

  private readonly orders = new Map<string, FakeOrder>();
  private readonly paymentsByOrder = new Map<string, string>();
  private counter = 0;

  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}_fake${String(this.counter).padStart(10, '0')}`;
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

    const order: PaymentOrder = {
      orderId: this.nextId('order'),
      amount: input.amount,
      currency: 'INR',
      receipt: input.receipt,
    };

    this.orders.set(order.orderId, { order, refunded: 0 });
    return order;
  }

  /**
   * Stands in for the Seeker completing checkout. The real adapter has no equivalent - the
   * provider's hosted widget does this - so it is only ever called from tests and the local
   * dev checkout screen.
   *
   * `knownAmount` rehydrates an order this instance has never seen. The store is in memory, so
   * a dev-server reload between creating the order and paying for it loses the order and the
   * payment fails for a reason that has nothing to do with the code under test. The caller
   * always has the amount already (it is on the booking), so passing it keeps the two-step flow
   * working across a reload without weakening the check: the captured amount is still compared
   * against the booking before anything is confirmed.
   */
  async simulateCheckout(orderId: string, knownAmount?: number): Promise<CapturedPayment> {
    let entry = this.orders.get(orderId);

    if (!entry) {
      if (knownAmount === undefined) {
        throw new PaymentAdapterError(`Unknown order ${orderId}`, 'not_found');
      }

      entry = {
        order: { orderId, amount: knownAmount, currency: 'INR', receipt: orderId },
        refunded: 0,
      };
      this.orders.set(orderId, entry);
    }

    if (entry.order.amount % 100 === FAIL_CAPTURE_SUFFIX) {
      throw new PaymentAdapterError('Simulated capture failure', 'provider_error');
    }

    const payment: CapturedPayment = {
      paymentId: this.nextId('pay'),
      orderId,
      amount: entry.order.amount,
      method: 'upi',
      capturedAt: new Date(),
    };

    entry.payment = payment;
    this.paymentsByOrder.set(payment.paymentId, orderId);
    return payment;
  }

  async fetchPayment(paymentId: string): Promise<CapturedPayment | null> {
    const orderId = this.paymentsByOrder.get(paymentId);
    if (!orderId) return null;
    return this.orders.get(orderId)?.payment ?? null;
  }

  async verifyWebhookSignature(
    rawBody: string,
    signature: string,
    secret: string,
  ): Promise<boolean> {
    const expected = await hmacHex(rawBody, secret);
    return timingSafeEqual(expected, signature);
  }

  /** Test helper: produces a body a caller can hand back to verifyWebhookSignature. */
  async signWebhook(rawBody: string, secret: string): Promise<string> {
    return hmacHex(rawBody, secret);
  }

  parseWebhook(rawBody: string): WebhookEvent {
    const parsed = JSON.parse(rawBody) as {
      event?: string;
      payload?: {
        payment?: {
          entity?: {
            id?: string;
            order_id?: string;
            amount?: number;
            error_description?: string;
          };
        };
      };
    };
    const entity = parsed.payload?.payment?.entity;

    return {
      type: parsed.event ?? 'unknown',
      paymentId: entity?.id ?? null,
      orderId: entity?.order_id ?? null,
      amount: entity?.amount ?? null,
      ...(entity?.error_description ? { failureReason: entity.error_description } : {}),
      raw: parsed,
    };
  }

  /**
   * `capturedAmount` rehydrates a payment this instance has never seen, for the same reason
   * `simulateCheckout` does: the store is in memory, so every payment made before the last dev
   * server reload - and every seeded or fixture payment - is unknown to it. Without this, no
   * cancellation refund and no dispute resolved in the seeker's favour can be exercised locally,
   * which is precisely the path most worth exercising. The over-refund cap still applies; it is
   * simply measured against what our own payments row recorded.
   */
  async refund(input: {
    paymentId: string;
    amount: number;
    notes?: Record<string, string>;
    capturedAmount?: number;
  }): Promise<RefundResult> {
    const orderId = this.paymentsByOrder.get(input.paymentId);
    let entry = orderId ? this.orders.get(orderId) : undefined;

    if (!entry?.payment) {
      if (input.capturedAmount === undefined) {
        throw new PaymentAdapterError(`Unknown payment ${input.paymentId}`, 'not_found');
      }

      const rehydratedOrderId = `order_for_${input.paymentId}`;
      entry = {
        order: {
          orderId: rehydratedOrderId,
          amount: input.capturedAmount,
          currency: 'INR',
          receipt: rehydratedOrderId,
        },
        payment: {
          paymentId: input.paymentId,
          orderId: rehydratedOrderId,
          amount: input.capturedAmount,
          method: 'upi',
          capturedAt: new Date(),
        },
        refunded: 0,
      };
      this.orders.set(rehydratedOrderId, entry);
      this.paymentsByOrder.set(input.paymentId, rehydratedOrderId);
    }

    const remaining = entry.payment!.amount - entry.refunded;
    if (input.amount > remaining) {
      throw new PaymentAdapterError(
        `Refund of ${input.amount} exceeds the ${remaining} still refundable`,
        'provider_error',
      );
    }

    entry.refunded += input.amount;
    return { refundId: this.nextId('rfnd'), amount: input.amount, status: 'processed' };
  }

  async createBeneficiary(input: {
    hostId: string;
    accountHolderName: string;
    accountNumber: string;
    ifsc: string;
    phone: string;
    email?: string;
  }): Promise<{ fundAccountId: string; contactId: string; accountLast4: string }> {
    const accountNumber = input.accountNumber.replace(/\s+/g, '');

    // Rejects the same inputs the real provider rejects, so the onboarding form is exercised
    // against real validation locally rather than discovering it on the day keys arrive.
    if (!/^\d{9,18}$/.test(accountNumber)) {
      throw new PaymentAdapterError('Account number must be 9-18 digits', 'provider_error');
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(input.ifsc.replace(/\s+/g, '').toUpperCase())) {
      throw new PaymentAdapterError('That is not a valid IFSC code', 'provider_error');
    }

    return {
      fundAccountId: this.nextId('fa'),
      contactId: this.nextId('cont'),
      accountLast4: accountNumber.slice(-4),
    };
  }

  async createPayout(request: PayoutRequest): Promise<PayoutResult> {
    if (request.amount % 100 === FAIL_PAYOUT_SUFFIX) {
      return {
        payoutId: this.nextId('pout'),
        status: 'failed',
        failureReason: 'Simulated beneficiary account validation failure',
      };
    }

    return { payoutId: this.nextId('pout'), status: 'processed' };
  }

  /** Test helper: wipes all state between cases. */
  reset(): void {
    this.orders.clear();
    this.paymentsByOrder.clear();
    this.counter = 0;
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
