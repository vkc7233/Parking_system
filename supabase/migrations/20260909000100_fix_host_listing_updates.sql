-- Let a host manage their own live listing again (spec §7.2, assumption A14).
--
-- `listings_update_own` carried `with check (status in ('draft','pending','paused') and
-- approved_by is null)`. Approval sets `approved_by`, so from the moment a listing went live its
-- owner could not touch it at all: not pause it, not change the price, not fix a typo in the
-- description. Verified against the database as the owning host — every one of those returned
-- "new row violates row-level security policy".
--
-- That breaks two Must features outright. §7.2 requires that "pausing a listing immediately
-- removes it from Seeker search results", and A14 says price and copy edits do *not* need
-- re-approval — both impossible under that check.
--
-- The rule the check was reaching for is narrower than what it wrote: a host must not be able to
-- publish their own listing. RLS `with check` cannot express it, because it sees only the new row
-- and "did this become live" is a question about the transition. So ownership is enforced here
-- and the transition is enforced by a trigger, which can see OLD.

drop policy if exists listings_update_own on public.listings;

create policy listings_update_own on public.listings
  for update to authenticated
  using (host_id = auth.uid() and not public.is_suspended())
  with check (host_id = auth.uid());

comment on policy listings_update_own on public.listings is
  'A host may edit their own listing. Publishing is not an edit - see listings_guard_publish.';

-- ---------------------------------------------------------------------------
-- Only an admin may publish
-- ---------------------------------------------------------------------------

create or replace function public.guard_listing_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- Only the transition into 'live' is restricted. Everything else a host does to their own
  -- listing - pausing, resubmitting, editing price or copy - is theirs to do.
  if new.status = 'live' and old.status is distinct from 'live' then
    -- auth.uid() is null for the service role and for migrations and seeds, which are trusted
    -- server contexts by definition. A signed-in caller must actually be an admin.
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Only an admin can publish a listing'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$fn$;

comment on function public.guard_listing_publish is
  'Spec 7.2: listings go live only through Admin approval, never by the host setting the status.';

-- Runs after check_material_listing_edits, which may itself rewrite the status to 'pending';
-- naming it later in the alphabet is what orders it, since Postgres fires BEFORE triggers in
-- name order and the material-edit rewrite must be visible to this guard.
drop trigger if exists listings_zz_guard_publish on public.listings;

create trigger listings_zz_guard_publish
  before update on public.listings
  for each row execute function public.guard_listing_publish();
