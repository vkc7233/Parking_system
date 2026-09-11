-- A host cannot block out a period they have already sold (spec §7.2, §10).
--
-- `availability_blocks` is enforced in one direction only: `enforce_booking_availability` refuses
-- a NEW booking that overlaps a block. Nothing refuses a new BLOCK that overlaps a booking which
-- already exists — and until now that gap was invisible, because no screen created blocks at all.
--
-- It matters the moment a host can. "I have blocked next Tuesday" would leave an already-confirmed
-- seeker arriving at a space the host believes is closed, with the booking still valid, still
-- paid, and still showing on the host's own calendar. The seeker did nothing wrong, so the block
-- is what has to give: the host cancels the booking first, which refunds the seeker under the
-- §7.4 policy and counts as a host cancellation under A13, or they pick a different window.
--
-- Enforced as a trigger rather than in the action, because RLS lets a host write this table
-- directly through the auto-generated API.

create or replace function public.guard_block_over_bookings()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_conflict record;
begin
  select b.reference, b.start_time, b.end_time
    into v_conflict
    from public.bookings b
   where b.listing_id = new.listing_id
     and b.status in ('pending_payment', 'confirmed')
     and b.time_range && tstzrange(new.start_time, new.end_time, '[)')
   order by b.start_time
   limit 1;

  if found then
    -- The reference is in the message on purpose: it is what the host needs to find the booking
    -- on their calendar, and a message that only says "there is a booking" sends them hunting.
    raise exception 'Booking % already runs from % to % in that period',
      v_conflict.reference,
      to_char(v_conflict.start_time at time zone 'Asia/Kolkata', 'DD Mon HH24:MI'),
      to_char(v_conflict.end_time at time zone 'Asia/Kolkata', 'HH24:MI')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

-- Completed bookings are deliberately not checked: they are in the past, and a host tidying up
-- old dates should not be stopped by a stay that already happened.
create trigger availability_blocks_guard_bookings
  before insert or update on public.availability_blocks
  for each row execute function public.guard_block_over_bookings();

-- Trigger functions are never callable directly, but SECURITY DEFINER still grants EXECUTE to
-- PUBLIC on creation. Revoked so the rule set in 20260909000800 stays uniform.
revoke all on function public.guard_block_over_bookings() from public, anon, authenticated;

comment on function public.guard_block_over_bookings is
  'Spec 7.2: refuses an availability block that would cover a live booking. The seeker has '
  'already paid, so the block is what gives - the host cancels the booking first.';
