-- Stop signed-in users calling privileged RPCs directly (spec §11, §12).
--
-- Verified before this migration, as an ordinary seeker over the auto-generated API:
--
--   unpaid_host_earnings('<any host id>', ...)  -> 27000 paise   (another host's revenue)
--   report_totals(...)                          -> 41400 paise   (the platform's whole GMV)
--
-- The cause is a Postgres default that is easy to miss and which an earlier migration of mine
-- got wrong: `CREATE FUNCTION` grants EXECUTE to **PUBLIC**, and `REVOKE ... FROM anon,
-- authenticated` does not touch that grant — those roles still inherit it through PUBLIC. The
-- revoke looked like a lock and was a no-op.
--
-- These are all SECURITY DEFINER, so they run with the owner's rights and RLS does not save us:
-- reaching them at all is the whole exposure. §11 is explicit that "the auto-generated API is
-- otherwise directly reachable", and §12 asks for role-based access enforced at the database.
--
-- Only functions a *client* legitimately needs are left callable. Trigger functions are never
-- callable directly by anyone regardless, but they are revoked too so the rule is uniform and a
-- future reader does not have to work out which is which.

-- ---------------------------------------------------------------------------
-- Revoke PUBLIC execute on everything privileged
-- ---------------------------------------------------------------------------

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grant back only what a client is supposed to call
-- ---------------------------------------------------------------------------

/*
 * Granted back by NAME rather than by full signature.
 *
 * Writing the argument list out by hand means this migration silently stops granting the moment
 * anyone adds a parameter - the grant would target a signature that no longer exists, and the
 * failure is a 403 for real users rather than an error here. Looking the function up by name
 * keeps the grant attached to whatever it actually is.
 */
do $$
declare
  fn record;
  allowed_anon text[] := array[
    -- Reads only `live` listings, which are public by RLS anyway.
    'search_nearby_listings',
    -- Shown to a signed-out visitor deciding whether a space is free.
    'listing_available_slots',
    -- Called by the RLS policies themselves, so they must remain callable by the roles those
    -- policies apply to. Each reads only the caller's own row.
    'is_admin',
    'is_suspended'
  ];
  allowed_authenticated text[] := array[
    -- A host creating or editing their own listing; the function checks ownership itself.
    'upsert_listing',
    -- Called when a signed-in seeker lists their first space.
    'promote_to_host',
    'host_onboarding_complete'
  ];
begin
  for fn in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
  loop
    if fn.proname = any(allowed_anon) then
      execute format('grant execute on function %s to anon, authenticated', fn.sig);
    elsif fn.proname = any(allowed_authenticated) then
      execute format('grant execute on function %s to authenticated', fn.sig);
    end if;
  end loop;
end;
$$;

-- Deliberately NOT granted, and the reason for this migration:
--   unpaid_host_earnings, host_payout_due, hosts_with_unpaid_earnings, report_totals
--     -> money across other people's accounts; the app reads these with the service role.
--   complete_elapsed_bookings, expire_unpaid_bookings
--     -> privileged writes; pg_cron runs them as the table owner.

comment on function public.unpaid_host_earnings is
  'Spec 7.2/7.3: completed, non-refunded, uncontested bookings past the A11 dispute hold that '
  'have not already been paid out. Refunds are netted off the host share. SERVICE ROLE ONLY - '
  'it reads money across hosts and is not granted to anon or authenticated.';
