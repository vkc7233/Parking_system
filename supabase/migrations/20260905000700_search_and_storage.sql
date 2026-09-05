-- Geospatial search, the availability check the checkout screen calls before quoting, and
-- the Storage buckets. Spec sections 7.1, 9.4, 9.6, 12.

-- ---------------------------------------------------------------------------
-- Availability
-- ---------------------------------------------------------------------------
-- The read-only counterpart of the enforce_booking_availability trigger. The trigger is the
-- guarantee; this is what the UI calls so a Seeker is told a slot is gone before paying,
-- rather than after.

create or replace function public.listing_available_slots(
  p_listing_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
)
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  select greatest(
    0,
    l.capacity - (
      select count(*)::integer
        from public.bookings b
       where b.listing_id = l.id
         and b.status in ('pending_payment', 'confirmed', 'completed')
         and b.time_range && tstzrange(p_start_time, p_end_time, '[)')
    )
  )
  from public.listings l
  where l.id = p_listing_id
    and l.status = 'live'
    and not exists (
      select 1 from public.availability_blocks ab
       where ab.listing_id = l.id
         and tstzrange(ab.start_time, ab.end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)')
    );
$fn$;

comment on function public.listing_available_slots is
  'Remaining capacity for a window. 0 or no row means not bookable. Assumption A4.';

-- ---------------------------------------------------------------------------
-- Nearby search (spec 7.1: results within 2 seconds on 4G)
-- ---------------------------------------------------------------------------
-- ST_DWithin on a geography column uses the GiST index and takes metres directly, so no
-- projection maths is needed. Ordering by distance is a second, cheap pass over the matches.
--
-- The function is SECURITY DEFINER and hard-filters to status = 'live', so it is safe to
-- expose to anonymous visitors: it can only ever return listings the RLS policy would allow.

create or replace function public.search_nearby_listings(
  p_lat double precision,
  p_lng double precision,
  p_radius_meters integer default 3000,
  p_start_time timestamptz default null,
  p_end_time timestamptz default null,
  p_min_price bigint default null,
  p_max_price bigint default null,
  p_spot_types public.spot_type[] default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  host_id uuid,
  title text,
  address_line text,
  locality text,
  city text,
  lat double precision,
  lng double precision,
  distance_meters double precision,
  spot_type public.spot_type,
  capacity integer,
  price_per_hour bigint,
  price_per_day bigint,
  average_rating numeric,
  review_count integer,
  primary_photo_path text,
  available_slots integer
)
language sql
stable
security definer
set search_path = public, extensions
as $fn$
  with origin as (
    select extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography as g
  )
  select
    l.id,
    l.host_id,
    l.title,
    l.address_line,
    l.locality,
    l.city,
    extensions.ST_Y(l.location::extensions.geometry) as lat,
    extensions.ST_X(l.location::extensions.geometry) as lng,
    extensions.ST_Distance(l.location, o.g) as distance_meters,
    l.spot_type,
    l.capacity,
    l.price_per_hour,
    l.price_per_day,
    lr.average_rating,
    lr.review_count,
    (
      select lp.storage_path
        from public.listing_photos lp
       where lp.listing_id = l.id
       order by lp.position
       limit 1
    ) as primary_photo_path,
    case
      when p_start_time is null or p_end_time is null then l.capacity
      else coalesce(public.listing_available_slots(l.id, p_start_time, p_end_time), 0)
    end as available_slots
  from public.listings l
  cross join origin o
  left join public.listing_ratings lr on lr.listing_id = l.id
  where l.status = 'live'
    and extensions.ST_DWithin(l.location, o.g, p_radius_meters)
    and (p_min_price is null or l.price_per_hour >= p_min_price)
    and (p_max_price is null or l.price_per_hour <= p_max_price)
    and (p_spot_types is null or l.spot_type = any (p_spot_types))
    -- When a window was given, hide anything with nothing left in it.
    and (
      p_start_time is null
      or p_end_time is null
      or coalesce(public.listing_available_slots(l.id, p_start_time, p_end_time), 0) > 0
    )
  order by distance_meters
  limit least(coalesce(p_limit, 50), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$fn$;

comment on function public.search_nearby_listings is
  'Spec 7.1 location-based search. Filters to live listings only, so anon-callable.';

grant execute on function public.search_nearby_listings to anon, authenticated;
grant execute on function public.listing_available_slots to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage buckets (spec 9.1, 12)
-- ---------------------------------------------------------------------------
-- listing-photos is public: listing pages must be crawlable (spec 7.4) and photos are not
-- personal data. kyc-documents is private and never served to a browser directly - Admins
-- read it through a short-lived signed URL.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('listing-photos', 'listing-photos', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('kyc-documents', 'kyc-documents', false, 10485760,
   array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

-- Photos are namespaced by host id: <host_id>/<listing_id>/<file>. The first path segment is
-- what the policies below check, so one host can never write into another host's folder.

create policy listing_photos_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'listing-photos');

create policy listing_photos_host_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy listing_photos_host_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy listing_photos_host_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'listing-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- KYC: a user can upload into their own folder and read back what they uploaded; an Admin can
-- read any of it to run the manual review (spec 4.2). Nobody can overwrite a submitted file.

create policy kyc_owner_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'kyc-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy kyc_owner_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'kyc-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy kyc_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'kyc-documents' and public.is_admin());
