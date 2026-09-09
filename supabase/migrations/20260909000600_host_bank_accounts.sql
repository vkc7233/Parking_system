-- Where a Host's payouts actually go (spec §7.2 onboarding, §7.3 payout processing).
--
-- Payouts sent the platform's own host id as `fund_account_id`, which is not a Razorpay fund
-- account, so a live payout could only ever have failed. Onboarding captured bank details as an
-- *uploaded image or PDF* — fine as a KYC artefact, useless as a payment instruction, and
-- nothing structured existed to send.
--
-- The account number is deliberately NOT stored. It is passed to the provider once, in exchange
-- for a fund account id, and only that id plus the last four digits are kept. A breach of this
-- table therefore exposes nobody's bank account, which is the standard §12 and the DPDP Act
-- expect of payment instruments — and it is the same reason card numbers live at Razorpay.

create table public.host_bank_accounts (
  host_id uuid primary key references public.users(id) on delete cascade,

  -- Provider-side identifiers. `fund_account_id` is what a payout is addressed to.
  provider text not null default 'razorpay',
  contact_id text not null,
  fund_account_id text not null,

  -- Enough to show a host which account they registered, and no more.
  account_holder_name text not null,
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
  ifsc text not null check (ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.host_bank_accounts is
  'Payout destination per host. The full account number is never stored - only the provider fund '
  'account id it was exchanged for.';

create trigger host_bank_accounts_touch
  before update on public.host_bank_accounts
  for each row execute function public.set_updated_at();

alter table public.host_bank_accounts enable row level security;

-- A host may see their own. Nobody may write through the API: rows are created by the server
-- action that talks to the provider, because a row here without a matching fund account at
-- Razorpay is a payout that fails at the bank rather than in our code.
create policy host_bank_accounts_select_own on public.host_bank_accounts
  for select to authenticated
  using (host_id = auth.uid() or public.is_admin());

comment on policy host_bank_accounts_select_own on public.host_bank_accounts is
  'Read-only to its owner. Writes go through the service role after the provider confirms.';
