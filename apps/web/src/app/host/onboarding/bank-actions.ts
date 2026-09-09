'use server';

/**
 * Registering a Host's payout destination (spec §7.2 onboarding, §7.3 payouts).
 *
 * The account number is sent to the payment provider and **never written to our database**. What
 * comes back is a fund account id, and that is what we store. A breach of this platform
 * therefore exposes nobody's bank account — the same reason card numbers live at Razorpay and
 * not here (§12, DPDP).
 *
 * Ordering matters and is deliberate: the provider is called first, and the row is written only
 * if it succeeds. The other way round leaves a row pointing at a fund account that does not
 * exist, which surfaces as a failed transfer at the bank days later rather than as an error the
 * host can act on now.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createPaymentsAdapter } from '@parking/api-client';
import { requireHost } from '@/lib/auth';
import { getServerEnv } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/service';
import { captureError } from '@/lib/observability';

export interface BankState {
  error?: string;
  success?: string;
}

const bankSchema = z.object({
  accountHolderName: z
    .string()
    .trim()
    .min(2, 'Enter the name exactly as it appears on the bank account')
    .max(120),
  // Indian account numbers run 9-18 digits depending on the bank.
  accountNumber: z
    .string()
    .transform((v) => v.replace(/\s+/g, ''))
    .pipe(z.string().regex(/^\d{9,18}$/, 'An account number is 9 to 18 digits')),
  confirmAccountNumber: z.string().transform((v) => v.replace(/\s+/g, '')),
  ifsc: z
    .string()
    .transform((v) => v.replace(/\s+/g, '').toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'That is not a valid IFSC code')),
});

export async function saveBankAccount(_prev: BankState, formData: FormData): Promise<BankState> {
  const profile = await requireHost('/host/onboarding');

  const parsed = bankSchema.safeParse({
    accountHolderName: formData.get('accountHolderName') ?? '',
    accountNumber: formData.get('accountNumber') ?? '',
    confirmAccountNumber: formData.get('confirmAccountNumber') ?? '',
    ifsc: formData.get('ifsc') ?? '',
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check those details and try again.' };
  }

  // Typed twice on purpose. A mistyped digit sends someone else's money to a real, valid
  // account, and nothing downstream can detect that — the bank does exactly as instructed.
  if (parsed.data.accountNumber !== parsed.data.confirmAccountNumber) {
    return { error: 'The two account numbers do not match.' };
  }

  const env = getServerEnv();
  const payments = createPaymentsAdapter({
    PAYMENTS_PROVIDER: env.PAYMENTS_PROVIDER,
    ...(env.RAZORPAY_KEY_ID ? { RAZORPAY_KEY_ID: env.RAZORPAY_KEY_ID } : {}),
    ...(env.RAZORPAY_KEY_SECRET ? { RAZORPAY_KEY_SECRET: env.RAZORPAY_KEY_SECRET } : {}),
  });

  let beneficiary;
  try {
    beneficiary = await payments.createBeneficiary({
      hostId: profile.id,
      accountHolderName: parsed.data.accountHolderName,
      accountNumber: parsed.data.accountNumber,
      ifsc: parsed.data.ifsc,
      phone: profile.phone,
      ...(profile.email ? { email: profile.email } : {}),
    });
  } catch (error) {
    await captureError(error, { source: 'host/onboarding/bank', userId: profile.id });
    return {
      error:
        'The payment provider would not accept those details. Check the account number and ' +
        'IFSC against your passbook and try again.',
    };
  }

  const service = createServiceClient();

  const { error } = await service.from('host_bank_accounts').upsert(
    {
      host_id: profile.id,
      provider: payments.name,
      contact_id: beneficiary.contactId,
      fund_account_id: beneficiary.fundAccountId,
      account_holder_name: parsed.data.accountHolderName,
      account_last4: beneficiary.accountLast4,
      ifsc: parsed.data.ifsc,
    },
    { onConflict: 'host_id' },
  );

  if (error) {
    await captureError(error, { source: 'host/onboarding/bank', userId: profile.id });
    return { error: 'Could not save those details. Please try again.' };
  }

  revalidatePath('/host/onboarding');
  return { success: `Payouts will go to the account ending ${beneficiary.accountLast4}.` };
}
