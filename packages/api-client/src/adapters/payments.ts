/**
 * Payment provider adapter.
 *
 * Razorpay merchant KYC and Payouts activation take 1-2 weeks (spec section 13), and the spec
 * itself flags that lead time as a risk to sprints 4-5 (section 16). So nothing in the
 * codebase talks to Razorpay directly: it talks to this interface, and a fake implementation
 * lets the whole booking loop be built and tested before the account exists.
 *
 * Swapping in the real provider is a config change (PAYMENTS_PROVIDER=razorpay), not a
 * refactor. Spec 9.7 keeps Razorpay Route/escrow out of the MVP, so `createPayout` here is
 * the manual, Admin-triggered batch payout described in section 6.3.
 */

export interface PaymentOrder {
  /** Provider-side order id, handed to the checkout widget. */
  orderId: string;
  /** Paise. */
  amount: number;
  currency: 'INR';
  /** Our booking id, echoed back on the webhook so it can be reconciled. */
  receipt: string;
}

export interface CapturedPayment {
  paymentId: string;
  orderId: string;
  amount: number;
  method: string | null;
  capturedAt: Date;
}

export interface RefundResult {
  refundId: string;
  amount: number;
  status: 'processed' | 'pending' | 'failed';
}

export interface PayoutRequest {
  /** Our payout row id, for idempotency and reconciliation. */
  reference: string;
  hostId: string;
  amount: number;
  /** Opaque provider-side beneficiary/fund-account id captured during host onboarding. */
  beneficiaryId: string;
  narration?: string;
}

export interface BeneficiaryInput {
  hostId: string;
  /** Must match the name on the bank account, or the transfer is rejected by the bank. */
  accountHolderName: string;
  accountNumber: string;
  ifsc: string;
  phone: string;
  email?: string;
}

export interface BeneficiaryResult {
  /** What `PayoutRequest.beneficiaryId` expects. */
  fundAccountId: string;
  /** Provider-side contact the fund account hangs off. Stored for support and reconciliation. */
  contactId: string;
  /** Last four digits, for showing the host which account they registered. */
  accountLast4: string;
}

export interface PayoutResult {
  payoutId: string;
  status: 'queued' | 'processing' | 'processed' | 'failed';
  failureReason?: string;
}

export interface WebhookEvent {
  /** Provider event name, e.g. 'payment.captured'. */
  type: string;
  paymentId: string | null;
  orderId: string | null;
  /** Paise. */
  amount: number | null;
  raw: unknown;
}

export interface PaymentsAdapter {
  readonly name: string;

  /** Creates the order the Seeker's checkout widget opens against. */
  createOrder(input: {
    amount: number;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<PaymentOrder>;

  /**
   * Confirms a payment really was captured, by asking the provider rather than trusting the
   * browser. Spec 7.1: "a booking is only confirmed after successful payment capture".
   */
  fetchPayment(paymentId: string): Promise<CapturedPayment | null>;

  /** Verifies the signature on a webhook body. Never process an unverified webhook. */
  verifyWebhookSignature(rawBody: string, signature: string, secret: string): Promise<boolean>;

  parseWebhook(rawBody: string): WebhookEvent;

  /** Full or partial refund, per the cancellation policy (assumption A2). */
  refund(input: {
    paymentId: string;
    amount: number;
    notes?: Record<string, string>;
    /**
     * What our own `payments` row says was captured. Optional, and never authoritative - the
     * provider's own record decides what can be refunded. It exists so an adapter that does not
     * hold provider-side history (the local fake) can still enforce the over-refund cap instead
     * of failing outright on a payment it has never seen.
     */
    capturedAmount?: number;
  }): Promise<RefundResult>;

  /**
   * Registers a Host's bank account with the provider and returns the id payouts are sent to.
   *
   * Called once during host onboarding. The account number is passed through and deliberately
   * never persisted by this platform — the returned id is what we keep, so a database breach
   * here does not expose anyone's bank account (§12, DPDP).
   */
  createBeneficiary(input: BeneficiaryInput): Promise<BeneficiaryResult>;

  /** Admin-triggered host settlement (spec 6.3, 9.7). */
  createPayout(request: PayoutRequest): Promise<PayoutResult>;
}

export class PaymentAdapterError extends Error {
  constructor(
    message: string,
    readonly code: 'provider_error' | 'not_found' | 'invalid_signature' | 'insufficient_funds',
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PaymentAdapterError';
  }
}
