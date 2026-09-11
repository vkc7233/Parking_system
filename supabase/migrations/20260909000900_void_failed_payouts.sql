-- Give a failed payout a way back into the queue (spec §6.3 step 3, §7.3).
--
-- When RazorpayX rejects a transfer, `processHostPayout` marks the payout `failed` and leaves the
-- line items attached, on the reasoning that the money must not silently re-queue itself while
-- the failure is unresolved. That reasoning is right. What was missing is the other half: the
-- code comment promises "an admin retries it explicitly once the cause is fixed", and no control
-- to do that was ever built.
--
-- Verified against the database before this migration, in a rolled-back transaction: a host owed
-- 54000 paise across one booking, with a payout marked `failed` and its line item still attached.
--
--   unpaid_host_earnings(host) before -> 1 line, 54000 paise
--   unpaid_host_earnings(host) after  -> 0 lines, 0 paise
--   hosts_with_unpaid_earnings()      -> the host is not in the queue at all
--
-- Both functions exclude any booking attached to a payout regardless of that payout's status, so
-- one failed transfer removes the money from every screen in the product, permanently, with no
-- way for anyone to notice it is gone. The host is simply never paid.
--
-- Retrying the SAME payout row cannot work, and that is worth stating so nobody builds it: the
-- row id is sent as the RazorpayX idempotency key, so a second call on the same row replays the
-- stored failure rather than attempting a new transfer. Returning the bookings to the queue and
-- paying again through the normal path is what actually re-attempts the money - it gets a fresh
-- payout row, a fresh idempotency key, and re-checks eligibility, the minimum, and the bank
-- account on the way through.
--
-- Voiding is deliberately a human decision rather than an automatic re-queue. "Failed" from a
-- bank can be ambiguous about whether money moved, and returning a transfer to the queue that
-- actually settled would pay the host twice. The admin confirms against the provider dashboard
-- first; this function only records what they decided.

-- ---------------------------------------------------------------------------
-- Record that a failed payout was written off, without losing it
-- ---------------------------------------------------------------------------

alter table public.payouts
  add column voided_at timestamptz,
  add column voided_by uuid references public.users (id),
  add column void_reason text;

-- Only a failed payout can be voided, and voiding is not reversible - a voided payout's bookings
-- have already gone back into the queue and may be in a newer payout by now.
alter table public.payouts
  add constraint payouts_void_is_complete check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null and status = 'failed')
  );

create index payouts_open_failures_idx on public.payouts (created_at desc)
  where status = 'failed' and voided_at is null;

comment on column public.payouts.voided_at is
  'Set when an admin returned this failed payout''s bookings to the queue. The row is kept as the '
  'record that a transfer was attempted and did not land.';

-- ---------------------------------------------------------------------------
-- Keep the recorded amount after the line items are detached
-- ---------------------------------------------------------------------------

/*
 * `sync_payout_amount` recomputes `payouts.amount` from its line items on every change. Detaching
 * them all would drive the amount to 0 - which `payouts_amount_check (amount > 0)` rejects, so
 * the delete would simply fail - and even if it did not, the row would lose the one number that
 * says how much the failed transfer was for.
 *
 * A voided payout is closed history: its amount is what was attempted, and it must not move.
 */
create or replace function public.sync_payout_amount()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_payout_id uuid := coalesce(new.payout_id, old.payout_id);
begin
  update public.payouts p
     set amount = coalesce(
           (select sum(amount) from public.payout_bookings where payout_id = v_payout_id), 0)
   where p.id = v_payout_id
     and p.voided_at is null;
  return coalesce(new, old);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- The operation itself
-- ---------------------------------------------------------------------------

/*
 * Detaching the line items and stamping the void have to happen together.
 *
 * As two PostgREST calls they are two transactions, and a failure between them leaves either
 * money loose in the queue under a payout that still looks open, or a voided payout whose
 * bookings are still stranded - the exact bug this migration exists to close, in a new shape.
 */
create or replace function public.void_failed_payout(
  p_payout_id uuid,
  p_admin_id uuid,
  p_reason text
)
returns table (host_id uuid, amount bigint, bookings_returned integer)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_payout public.payouts%rowtype;
  v_returned integer;
begin
  select * into v_payout from public.payouts where id = p_payout_id for update;

  if not found then
    raise exception 'No such payout' using errcode = 'P0002';
  end if;

  if v_payout.status <> 'failed' then
    raise exception 'Only a failed payout can be returned to the queue (this one is %)',
      v_payout.status using errcode = 'P0001';
  end if;

  if v_payout.voided_at is not null then
    raise exception 'That payout was already returned to the queue' using errcode = 'P0001';
  end if;

  -- Stamped before the delete, so the amount-sync trigger sees a voided row and leaves the
  -- recorded amount alone.
  update public.payouts
     set voided_at = now(),
         voided_by = p_admin_id,
         void_reason = nullif(btrim(p_reason), ''),
         updated_at = now()
   where id = p_payout_id;

  delete from public.payout_bookings where payout_id = p_payout_id;
  get diagnostics v_returned = row_count;

  return query select v_payout.host_id, v_payout.amount, v_returned;
end;
$fn$;

comment on function public.void_failed_payout is
  'Spec 7.3: returns a failed payout''s bookings to the unpaid queue so they can be paid again '
  'under a new payout row and a new idempotency key. SERVICE ROLE ONLY - it moves money between '
  'hosts'' accounts and is not granted to anon or authenticated.';

-- `CREATE FUNCTION` grants EXECUTE to PUBLIC, and this one is SECURITY DEFINER, so without this
-- any signed-in user could void payouts. See 20260909000800 for how that default was missed once
-- already.
revoke all on function public.void_failed_payout(uuid, uuid, text) from public, anon, authenticated;
