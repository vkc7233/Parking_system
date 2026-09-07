-- Listing create/update RPCs and host promotion. Sprint 1 (spec section 7.2).
--
-- Why an RPC rather than a plain PostgREST insert: `location` is a PostGIS geography column,
-- and there is no dependable way to write one through the auto-generated REST API. Taking
-- lat/lng and constructing the point here keeps a single, typed entry point and keeps the
-- geography construction next to the constraint that depends on it.
--
-- These are SECURITY INVOKER (the default) on purpose: every row they touch is still subject
-- to the listings RLS policies, so a Host cannot create or edit a listing under another Host's
-- id even by calling the function directly.

create or replace function public.upsert_listing(
  p_title text,
  p_address_line text,
  p_city text,
  p_lat double precision,
  p_lng double precision,
  p_spot_type public.spot_type,
  p_price_per_hour bigint,
  p_id uuid default null,
  p_description text default null,
  p_locality text default null,
  p_state text default null,
  p_pincode text default null,
  p_capacity integer default 1,
  p_price_per_day bigint default null,
  p_available_from time default null,
  p_available_until time default null,
  p_rules text default null
)
returns uuid
language plpgsql
set search_path = public, extensions
as $fn$
declare
  v_id uuid;
  v_point extensions.geography;
begin
  if p_lat is null or p_lng is null then
    raise exception 'A listing needs a location' using errcode = 'check_violation';
  end if;

  -- ST_MakePoint takes (x, y) - longitude first. Swapping these is the single easiest mistake
  -- to make with PostGIS, and it puts an Ahmedabad listing somewhere off the coast of Somalia.
  v_point := extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography;

  if p_id is null then
    insert into public.listings (
      host_id, title, description, address_line, locality, city, state, pincode,
      location, spot_type, capacity, price_per_hour, price_per_day,
      available_from, available_until, rules, status
    )
    values (
      auth.uid(), p_title, p_description, p_address_line, p_locality, p_city, p_state, p_pincode,
      v_point, p_spot_type, coalesce(p_capacity, 1), p_price_per_hour, p_price_per_day,
      p_available_from, p_available_until, p_rules, 'draft'
    )
    returning id into v_id;
  else
    update public.listings
       set title = p_title,
           description = p_description,
           address_line = p_address_line,
           locality = p_locality,
           city = p_city,
           state = p_state,
           pincode = p_pincode,
           location = v_point,
           spot_type = p_spot_type,
           capacity = coalesce(p_capacity, 1),
           price_per_hour = p_price_per_hour,
           price_per_day = p_price_per_day,
           available_from = p_available_from,
           available_until = p_available_until,
           rules = p_rules
     where id = p_id
    returning id into v_id;

    -- RLS filtered the row out, or it does not exist. Either way the caller may not have it.
    if v_id is null then
      raise exception 'Listing not found, or you do not have permission to edit it'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return v_id;
end;
$fn$;

comment on function public.upsert_listing is
  'Creates or edits a listing. SECURITY INVOKER, so listings RLS still applies (spec 7.2).';

grant execute on function public.upsert_listing to authenticated;

-- ---------------------------------------------------------------------------
-- Host promotion (spec 7.2, 8.4)
-- ---------------------------------------------------------------------------
-- Spec 8.4: one account, role-aware navigation - a Seeker becomes a Host by listing a space,
-- not by registering separately. The users RLS policy deliberately pins `role` so a user
-- cannot edit their own, so the promotion needs a SECURITY DEFINER function.
--
-- It can only ever move 'seeker' to 'host'. There is no path to 'admin' here, which is the
-- whole reason this is a narrow function rather than a broader "update my profile" policy.

create or replace function public.promote_to_host()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.users
     set role = 'host'
   where id = auth.uid()
     and role = 'seeker';
end;
$fn$;

comment on function public.promote_to_host is
  'Seeker -> host only. Never grants admin. Spec 8.4: one account, two modes.';

grant execute on function public.promote_to_host to authenticated;

-- ---------------------------------------------------------------------------
-- Listing photo ordering
-- ---------------------------------------------------------------------------
-- Photos carry a unique (listing_id, position). Deleting the middle photo of three would
-- otherwise leave a gap that the next insert collides with, so positions are re-packed.

create or replace function public.repack_listing_photo_positions(p_listing_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
begin
  with ordered as (
    select id, row_number() over (order by position, created_at) - 1 as new_position
      from public.listing_photos
     where listing_id = p_listing_id
  )
  update public.listing_photos lp
     set position = o.new_position + 1000
    from ordered o
   where lp.id = o.id;

  -- Two passes because the unique constraint would trip mid-update on a single pass.
  update public.listing_photos
     set position = position - 1000
   where listing_id = p_listing_id
     and position >= 1000;
end;
$fn$;

grant execute on function public.repack_listing_photo_positions to authenticated;

-- ---------------------------------------------------------------------------
-- Readable coordinates
-- ---------------------------------------------------------------------------
-- `location` is a geography column, and PostgREST returns it as WKB hex - unusable for
-- re-populating the edit form. ST_X/ST_Y on a geometry are IMMUTABLE, and so is the
-- geography-to-geometry cast, so these can be generated columns rather than a second RPC.
--
-- They are derived, never written: upsert_listing still takes lat/lng and builds the point,
-- so there is exactly one source of truth for where a listing is.

alter table public.listings
  add column lat double precision
    generated always as (extensions.ST_Y(location::extensions.geometry)) stored,
  add column lng double precision
    generated always as (extensions.ST_X(location::extensions.geometry)) stored;

comment on column public.listings.lat is
  'Derived from location. Read-only: write through upsert_listing.';
