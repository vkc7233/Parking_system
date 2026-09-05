-- Listings, their photos, the Host Listing Agreement evidence trail, and host-blocked
-- availability windows. Spec sections 7.2, 8.2, 10.

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  description text,

  -- Address as entered/geocoded, plus the exact map pin the Host dropped (spec 6.2 step 3).
  address_line text not null,
  locality text,
  city text not null,
  state text,
  pincode text,
  -- PostGIS geography point (SRID 4326). geography, not geometry, so ST_DWithin works in
  -- metres without projecting - which is what the "listings within X km" query needs (9.6).
  location extensions.geography (Point, 4326) not null,

  spot_type public.spot_type not null,
  -- Assumption A4: capacity 1 reproduces the spec's no-double-booking rule exactly.
  capacity integer not null default 1 check (capacity between 1 and 20),

  -- Assumption A3: price_per_hour is authoritative; price_per_day is a daily cap, nullable.
  price_per_hour bigint not null check (price_per_hour >= 0),
  price_per_day bigint check (price_per_day is null or price_per_day >= 0),
  currency text not null default 'INR' check (currency = 'INR'),

  -- Daily availability window in local wall-clock time, e.g. 07:00-22:00. Null means 24h.
  available_from time,
  available_until time,

  rules text,

  status public.listing_status not null default 'draft',
  -- Assumption A6 / spec 7.2: no listing may be approved without a signature on file. This
  -- column is the enforcement point; the evidence lives in listing_agreements.
  agreement_signed_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.users (id),
  rejection_reason text,
  paused_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint listings_daily_cap_is_a_discount check (
    price_per_day is null or price_per_hour = 0 or price_per_day <= price_per_hour * 24
  ),
  constraint listings_has_a_price check (
    price_per_hour > 0 or (price_per_day is not null and price_per_day > 0)
  ),
  constraint listings_rejection_has_reason check (
    status <> 'rejected' or rejection_reason is not null
  )
);

comment on table public.listings is
  'Spec section 10. A listing is only bookable when status = live.';
comment on column public.listings.location is
  'PostGIS geography point; ST_DWithin against this powers the nearby search (spec 9.6).';
comment on column public.listings.price_per_day is
  'Assumption A3: a cap on the hourly charge per 24h window, not an alternative rate.';

-- The index the "spots near me" query rides on (spec 7.1: results within 2 seconds).
create index listings_location_gix on public.listings using gist (location);
-- Partial: Seeker search only ever looks at live listings, so the index stays small.
create index listings_live_location_gix on public.listings using gist (location)
  where status = 'live';
create index listings_host_id_idx on public.listings (host_id);
create index listings_status_idx on public.listings (status);
create index listings_approval_queue_idx on public.listings (submitted_at)
  where status = 'pending';

create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- listing_photos
-- ---------------------------------------------------------------------------
-- A child table rather than the spec's photos[] column: it gives each photo a stable id for
-- deletion and reordering, and lets the minimum-count rule be checked with a plain count.

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  storage_path text not null,
  alt_text text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (listing_id, position)
);

create index listing_photos_listing_id_idx on public.listing_photos (listing_id, position);

-- ---------------------------------------------------------------------------
-- listing_agreements - Host Listing Agreement evidence (assumption A6)
-- ---------------------------------------------------------------------------
-- Records not just that a Host signed, but exactly which wording they saw. agreement_hash is
-- the SHA-256 of the served text, so the agreed terms can be proved after a later revision.

create table public.listing_agreements (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  host_id uuid not null references public.users (id) on delete cascade,
  agreement_version text not null,
  agreement_hash text not null,
  -- The Host types their full legal name; the checkbox is the affirmative act.
  signed_name text not null check (length(trim(signed_name)) >= 3),
  signed_at timestamptz not null default now(),
  ip_address inet,
  user_agent text,
  unique (listing_id, agreement_version)
);

comment on table public.listing_agreements is
  'Assumption A6. LEGAL: confirm this evidence set satisfies IT Act electronic-record needs.';

create index listing_agreements_host_id_idx on public.listing_agreements (host_id);

-- Keeps listings.agreement_signed_at in step with the evidence table, so the approval rule
-- below can be a cheap column check while the audit trail stays authoritative.
create or replace function public.sync_listing_agreement_signed_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.listings
     set agreement_signed_at = new.signed_at
   where id = new.listing_id
     and (agreement_signed_at is null or agreement_signed_at < new.signed_at);
  return new;
end;
$fn$;

create trigger listing_agreements_sync
  after insert on public.listing_agreements
  for each row execute function public.sync_listing_agreement_signed_at();

-- ---------------------------------------------------------------------------
-- availability_blocks - host-declared unavailable windows (spec section 10)
-- ---------------------------------------------------------------------------

create table public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint availability_blocks_ordered check (end_time > start_time)
);

create index availability_blocks_listing_time_idx
  on public.availability_blocks (listing_id, start_time, end_time);

-- ---------------------------------------------------------------------------
-- Listing lifecycle rules (spec 7.2, 7.3)
-- ---------------------------------------------------------------------------

create or replace function public.enforce_listing_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_photo_count integer;
begin
  -- Submitting for approval: at least 2 photos (spec 7.2), and the Host must have completed
  -- onboarding (spec 7.2 - "onboarding cannot be skipped before a first listing").
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    select count(*) into v_photo_count
      from public.listing_photos where listing_id = new.id;

    if v_photo_count < 2 then
      raise exception 'A listing needs at least 2 photos before it can be submitted (has %)',
        v_photo_count
        using errcode = 'check_violation';
    end if;

    if not public.host_onboarding_complete(new.host_id) then
      raise exception 'Host onboarding must be completed before submitting a listing'
        using errcode = 'check_violation';
    end if;

    new.submitted_at := coalesce(new.submitted_at, now());
  end if;

  -- Going live: the signed Host Listing Agreement is a hard precondition (spec 7.2 -
  -- "no listing can be approved by Admin without a recorded, timestamped signature on file").
  if new.status = 'live' and (tg_op = 'INSERT' or old.status is distinct from 'live') then
    if new.agreement_signed_at is null then
      raise exception 'Listing cannot go live without a signed Host Listing Agreement'
        using errcode = 'check_violation';
    end if;
    new.approved_at := coalesce(new.approved_at, now());
  end if;

  if new.status = 'paused' and (tg_op = 'INSERT' or old.status is distinct from 'paused') then
    new.paused_at := now();
  end if;

  return new;
end;
$fn$;

create trigger listings_enforce_lifecycle
  before insert or update on public.listings
  for each row execute function public.enforce_listing_lifecycle();

-- Spec 7.3: "Suspending a Host immediately delists all of that Host's listings."
create or replace function public.delist_on_host_suspension()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.suspended_at is not null and old.suspended_at is null then
    update public.listings
       set status = 'paused', paused_at = now()
     where host_id = new.id and status = 'live';
  end if;
  return new;
end;
$fn$;

create trigger users_delist_on_suspension
  after update of suspended_at on public.users
  for each row execute function public.delist_on_host_suspension();
