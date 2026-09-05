-- Local development seed. Runs on `pnpm db:reset`.
--
-- Gives you a working pilot-city marketplace to develop against: an admin, two hosts with
-- completed onboarding, two seekers, and a handful of live listings around Ahmedabad
-- (assumption A8) with realistic pilot-city pricing.
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
   '{"provider":"phone","providers":["phone"]}', '{"name":"Priya Admin"}', now(), now(),
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', '919000000002', now(),
   '{"provider":"phone","providers":["phone"]}', '{"name":"Meena Shah"}', now(), now(),
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', '919000000003', now(),
   '{"provider":"phone","providers":["phone"]}', '{"name":"Kiran Patel"}', now(), now(),
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', '919000000004', now(),
   '{"provider":"phone","providers":["phone"]}', '{"name":"Rohan Desai"}', now(), now(),
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000005',
   'authenticated', 'authenticated', '919000000005', now(),
   '{"provider":"phone","providers":["phone"]}', '{"name":"Anjali Mehta"}', now(), now(),
   '', '', '', '', '', '', '', '')
on conflict (id) do nothing;

update public.users set name = 'Priya Admin', role = 'admin', kyc_status = 'verified'
 where id = '00000000-0000-4000-8000-000000000001';
update public.users set name = 'Meena Shah', role = 'host', kyc_status = 'verified'
 where id = '00000000-0000-4000-8000-000000000002';
update public.users set name = 'Kiran Patel', role = 'host', kyc_status = 'verified'
 where id = '00000000-0000-4000-8000-000000000003';
update public.users set name = 'Rohan Desai', role = 'seeker'
 where id = '00000000-0000-4000-8000-000000000004';
update public.users set name = 'Anjali Mehta', role = 'seeker'
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
-- Real Ahmedabad micro-markets with parking pressure: CG Road, Prahlad Nagar, Navrangpura,
-- Bodakdev, Maninagar. Prices in paise (assumption A9): 3000 = Rs 30/hour.

insert into public.listings (
  id, host_id, title, description, address_line, locality, city, state, pincode,
  location, spot_type, capacity, price_per_hour, price_per_day, available_from, available_until,
  rules, status
)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
   'Covered slot off CG Road',
   'Single covered slot in a residential compound, 3 minutes walk from CG Road shopping.',
   '12 Swastik Society, Navrangpura', 'Navrangpura', 'Ahmedabad', 'Gujarat', '380009',
   extensions.ST_SetSRID(extensions.ST_MakePoint(72.5613, 23.0339), 4326)::extensions.geography,
   'covered', 1, 3000, 20000, '07:00', '22:00',
   'No overnight stays. Please do not block the gate.', 'draft'),

  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002',
   'Basement parking, Prahlad Nagar',
   'Secure basement bay in a gated apartment complex with 24h security.',
   'Sun Complex, Prahlad Nagar Road', 'Prahlad Nagar', 'Ahmedabad', 'Gujarat', '380015',
   extensions.ST_SetSRID(extensions.ST_MakePoint(72.5074, 23.0106), 4326)::extensions.geography,
   'basement', 2, 4000, 25000, null, null,
   'Reverse into the bay. Sedans and hatchbacks only.', 'draft'),

  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003',
   'Driveway spot near Law Garden',
   'Open driveway space, easy access, walking distance to Law Garden market.',
   '8 Ellisbridge Society', 'Ellisbridge', 'Ahmedabad', 'Gujarat', '380006',
   extensions.ST_SetSRID(extensions.ST_MakePoint(72.5652, 23.0225), 4326)::extensions.geography,
   'driveway', 1, 2500, 15000, '06:00', '23:00',
   'Please park close to the left wall.', 'draft'),

  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003',
   'Stilt parking, Bodakdev',
   'Stilt parking under a residential tower, close to the SG Highway offices.',
   'Silver Oak Towers, Bodakdev', 'Bodakdev', 'Ahmedabad', 'Gujarat', '380054',
   extensions.ST_SetSRID(extensions.ST_MakePoint(72.5075, 23.0395), 4326)::extensions.geography,
   'stilt', 3, 3500, 22000, null, null,
   'Weekday commuters preferred. No car washing on site.', 'draft'),

  ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002',
   'Open compound spot, Maninagar',
   'Open spot in a private compound, five minutes from Maninagar railway station.',
   '44 Rambag Road, Maninagar', 'Maninagar', 'Ahmedabad', 'Gujarat', '380008',
   extensions.ST_SetSRID(extensions.ST_MakePoint(72.6009, 22.9964), 4326)::extensions.geography,
   'open', 1, 2000, 12000, '05:00', '23:59',
   'Station commuters welcome. Gate closes at midnight.', 'draft')
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

-- A host-blocked window on the Prahlad Nagar listing, for testing availability logic.
insert into public.availability_blocks (listing_id, start_time, end_time, reason)
values (
  '10000000-0000-4000-8000-000000000002',
  date_trunc('day', now()) + interval '2 days' + interval '9 hours',
  date_trunc('day', now()) + interval '2 days' + interval '18 hours',
  'Building maintenance'
)
on conflict do nothing;
