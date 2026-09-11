-- Local development seed. Runs on `pnpm db:reset`.
--
-- Gives you a working pilot-city marketplace to develop against: an admin, two hosts with
-- completed onboarding, two seekers, and live listings across Pune (assumption A8) at
-- realistic local pricing.
--
-- NEVER runs against a hosted project - `supabase db reset` only touches the local stack.

-- ---------------------------------------------------------------------------
-- Auth users
-- ---------------------------------------------------------------------------
-- Phone-OTP accounts (spec 7.1), so there is no password to set. The on_auth_user_created
-- trigger creates the matching public.users row for each of these.
--
-- Phone numbers are stored WITHOUT the leading '+'. That is the format Supabase Auth (GoTrue)
-- normalises to, and signing in matches on it exactly - seed a number as '+9190...' and the
-- first real login creates a SECOND, empty account instead of logging into this one.
--
-- The local sign-in codes for these numbers are in supabase/config.toml under
-- [auth.sms.test_otp]: the code is 1000 followed by the last two digits of the number.

--
-- The empty-string token columns below are not decoration. Supabase Auth (GoTrue) scans them
-- into Go `string` fields, so a NULL makes it fail with
--   "Scan error on column confirmation_token: converting NULL to string is unsupported"
-- and every sign-in for that account returns a 500. They must be '' , not NULL.

insert into auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
  email_change, phone_change, phone_change_token, reauthentication_token
)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', '919000000001', now(),
   '{"provider":"phone","providers":["phone"]}', '{"name":"Priya Deshmukh"}', now(), now(),
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', '919000000002', now(),
   '{"provider":"phone","providers":["phone"]}', '{"name":"Meena Kulkarni"}', now(), now(),
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', '919000000003', now(),
   '{"provider":"phone","providers":["phone"]}', '{"name":"Kiran Joshi"}', now(), now(),
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', '919000000004', now(),
   '{"provider":"phone","providers":["phone"]}', '{"name":"Rohan Bhosale"}', now(), now(),
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000005',
   'authenticated', 'authenticated', '919000000005', now(),
   '{"provider":"phone","providers":["phone"]}', '{"name":"Anjali Sathe"}', now(), now(),
   '', '', '', '', '', '', '', '')
on conflict (id) do nothing;

update public.users set name = 'Priya Deshmukh', role = 'admin', kyc_status = 'verified'
 where id = '00000000-0000-4000-8000-000000000001';
update public.users set name = 'Meena Kulkarni', role = 'host', kyc_status = 'verified'
 where id = '00000000-0000-4000-8000-000000000002';
update public.users set name = 'Kiran Joshi', role = 'host', kyc_status = 'verified'
 where id = '00000000-0000-4000-8000-000000000003';
update public.users set name = 'Rohan Bhosale', role = 'seeker'
 where id = '00000000-0000-4000-8000-000000000004';
update public.users set name = 'Anjali Sathe', role = 'seeker'
 where id = '00000000-0000-4000-8000-000000000005';

-- ---------------------------------------------------------------------------
-- Host onboarding documents
-- ---------------------------------------------------------------------------
-- All three types present and verified, which is what host_onboarding_complete() requires
-- before a listing can be submitted for approval (spec 7.2).

insert into public.documents (user_id, type, file_path, verified_status, reviewed_by, reviewed_at)
select h.id, d.type, h.id || '/' || d.type || '.pdf', 'verified',
       '00000000-0000-4000-8000-000000000001', now()
  from (values
    ('00000000-0000-4000-8000-000000000002'::uuid),
    ('00000000-0000-4000-8000-000000000003'::uuid)
  ) as h(id)
  cross join (values
    ('identity_proof'::public.document_type),
    ('address_proof'::public.document_type),
    ('bank_details'::public.document_type)
  ) as d(type)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------
-- Real Pune micro-markets with genuine parking pressure, spread deliberately across the city so
-- a default-radius search from any of them returns something: the restaurant districts (Koregaon
-- Park, Kalyani Nagar), the commercial core (Camp/MG Road, Deccan), the IT corridors (Hinjewadi,
-- Magarpatta), and a transit hub (Pune Station).
--
-- Prices in paise (assumption A9): 4000 = Rs 40/hour. Koregaon Park and Camp are priced highest
-- because that is where the scarcity actually is; Hinjewadi is cheaper but sells on volume.

insert into public.listings (
  id, host_id, title, description, address_line, locality, city, state, pincode,
  location, spot_type, capacity, price_per_hour, price_per_day, available_from, available_until,
  rules, status
)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
   'Covered bay off North Main Road',
   'Single covered bay inside a gated society, three minutes walk from the Koregaon Park restaurants.',
   '14 Lane 5, Koregaon Park', 'Koregaon Park', 'Pune', 'Maharashtra', '411001',
   extensions.ST_SetSRID(extensions.ST_MakePoint(73.8939, 18.5362), 4326)::extensions.geography,
   'covered', 1, 5000, 32000, '07:00', '23:30',
   'No overnight stays. Please do not block the society gate.', 'draft'),

  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002',
   'Basement parking near MG Road',
   'Secure basement bay in a commercial building with 24-hour security, two minutes from MG Road.',
   'Clover Centre, Moledina Road, Camp', 'Camp', 'Pune', 'Maharashtra', '411001',
   extensions.ST_SetSRID(extensions.ST_MakePoint(73.8790, 18.5158), 4326)::extensions.geography,
   'basement', 2, 6000, 40000, null, null,
   'Reverse into the bay. Hatchbacks and sedans only - low clearance.', 'draft'),

  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003',
   'Driveway spot near FC Road',
   'Open driveway space in a quiet lane, walking distance to Fergusson College Road and Deccan.',
   '8 Bhandarkar Institute Road, Deccan', 'Deccan', 'Pune', 'Maharashtra', '411004',
   extensions.ST_SetSRID(extensions.ST_MakePoint(73.8415, 18.5158), 4326)::extensions.geography,
   'driveway', 1, 3500, 22000, '06:00', '23:00',
   'Please park close to the left wall so the gate can open.', 'draft'),

  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003',
   'Stilt parking, Hinjewadi Phase 1',
   'Stilt parking under a residential tower, five minutes from the Phase 1 IT park gates.',
   'Rose Icon, Hinjewadi Phase 1', 'Hinjewadi', 'Pune', 'Maharashtra', '411057',
   extensions.ST_SetSRID(extensions.ST_MakePoint(73.7389, 18.5913), 4326)::extensions.geography,
   'stilt', 3, 3000, 18000, null, null,
   'Weekday commuters preferred. No car washing on site.', 'draft'),

  ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002',
   'Open compound spot near Pune Station',
   'Open spot in a private compound, six minutes walk from the railway station and the bus stand.',
   '22 Sadhu Vaswani Path, Agarkar Nagar', 'Agarkar Nagar', 'Pune', 'Maharashtra', '411001',
   extensions.ST_SetSRID(extensions.ST_MakePoint(73.8743, 18.5286), 4326)::extensions.geography,
   'open', 1, 2500, 15000, '05:00', '23:59',
   'Station commuters welcome. Gate closes at midnight.', 'draft'),

  ('10000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000003',
   'Covered bay in Magarpatta City',
   'Covered visitor bay inside the township, close to the Magarpatta IT offices and Seasons Mall.',
   'Zeta Building, Magarpatta City, Hadapsar', 'Hadapsar', 'Pune', 'Maharashtra', '411013',
   extensions.ST_SetSRID(extensions.ST_MakePoint(73.9260, 18.5158), 4326)::extensions.geography,
   'covered', 2, 4000, 26000, '07:00', '22:00',
   'Carry the pass - the township gate checks it on entry.', 'draft')
on conflict (id) do nothing;

-- Two photos each, the minimum the lifecycle trigger enforces at submission (spec 7.2).
insert into public.listing_photos (listing_id, storage_path, alt_text, position)
select l.id,
       l.host_id || '/' || l.id || '/photo-' || p.n || '.jpg',
       l.title || ' - view ' || p.n,
       p.n
  from public.listings l
  cross join (values (0), (1)) as p(n)
on conflict do nothing;

-- Signed Host Listing Agreements (assumption A6). The sync trigger stamps
-- listings.agreement_signed_at, which the lifecycle trigger then requires before going live.
insert into public.listing_agreements (
  listing_id, host_id, agreement_version, agreement_hash, signed_name, ip_address, user_agent
)
select l.id, l.host_id, '2026-09-v1',
       encode(extensions.digest('seed-agreement-text-' || l.id::text, 'sha256'), 'hex'),
       u.name, '127.0.0.1'::inet, 'seed/local-development'
  from public.listings l
  join public.users u on u.id = l.host_id
on conflict do nothing;

-- Promote through the real lifecycle rather than inserting 'live' directly, so the seed
-- exercises the same triggers the application does.
update public.listings set status = 'pending';
update public.listings
   set status = 'live', approved_by = '00000000-0000-4000-8000-000000000001';

-- One listing paused, to give the Host dashboard and search filtering something to show.
update public.listings set status = 'paused'
 where id = '10000000-0000-4000-8000-000000000005';

-- A host-blocked window on the MG Road listing, for testing availability logic.
--
-- Built in Asia/Kolkata rather than in the database's zone. `date_trunc('day', now())` truncates
-- to midnight UTC, so "+ 9 hours" was 09:00 UTC - which is 14:30 in Pune, and made the seeded
-- maintenance window read as 2:30pm to 11:30pm on the host's own calendar.
insert into public.availability_blocks (listing_id, start_time, end_time, reason)
values (
  '10000000-0000-4000-8000-000000000002',
  (date_trunc('day', now() at time zone 'Asia/Kolkata') + interval '2 days' + interval '9 hours')
    at time zone 'Asia/Kolkata',
  (date_trunc('day', now() at time zone 'Asia/Kolkata') + interval '2 days' + interval '18 hours')
    at time zone 'Asia/Kolkata',
  'Building maintenance'
)
on conflict do nothing;
