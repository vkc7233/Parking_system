-- Row-Level Security. Spec section 11: "every table should have an explicit policy rather
-- than relying on application-layer checks alone, since Supabase's auto-generated API is
-- otherwise directly reachable by clients."
--
-- Two rules shape everything below:
--
--   1. Anything that decides an amount of money is NOT client-writable. Bookings, payments,
--      payouts and payout lines are written only by Edge Functions using the service role
--      key, which bypasses RLS. If a browser could insert a booking row it could choose its
--      own price, and no amount of UI validation would stop it.
--
--   2. Reads are scoped to the person they concern. A Seeker sees their own bookings, a Host
--      sees bookings against their own listings, an Admin sees everything.

alter table public.users enable row level security;
alter table public.documents enable row level security;
alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;
alter table public.listing_agreements enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.payouts enable row level security;
alter table public.payout_bookings enable row level security;
alter table public.reviews enable row level security;
alter table public.notification_log enable row level security;
alter table public.admin_audit_log enable row level security;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

create policy users_select_own on public.users
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- Role, KYC status and suspension are set by Admins and triggers, never by the user. The
-- WITH CHECK clause pins them to their current values so a self-update cannot escalate.
create policy users_update_own on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select role from public.users where id = auth.uid())
    and kyc_status = (select kyc_status from public.users where id = auth.uid())
    and suspended_at is not distinct from (select suspended_at from public.users where id = auth.uid())
  );

create policy users_admin_all on public.users
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Listing pages show the host's display name and join date. Exposing the users table for
-- that would also expose phone numbers, so a narrow view is used instead. The view runs with
-- the definer's rights (security_invoker off) and selects only non-personal columns.
create view public.host_profiles as
  select u.id, u.name, u.created_at as host_since
    from public.users u
   where u.role in ('host', 'admin');

comment on view public.host_profiles is
  'Public-safe host identity for listing pages. Never expose users.phone or users.email here.';

grant select on public.host_profiles to anon, authenticated;

-- ---------------------------------------------------------------------------
-- documents (KYC-lite)
-- ---------------------------------------------------------------------------

create policy documents_select_own on public.documents
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy documents_insert_own on public.documents
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and verified_status = 'pending'
    and reviewed_by is null
  );

-- A user may replace a document that has not been reviewed yet; once an Admin has ruled on
-- it, only an Admin can change it.
create policy documents_update_own_pending on public.documents
  for update to authenticated
  using (user_id = auth.uid() and verified_status = 'pending')
  with check (user_id = auth.uid() and verified_status = 'pending');

create policy documents_admin_all on public.documents
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- listings
-- ---------------------------------------------------------------------------

-- Spec 7.4 wants public listing pages indexable, so anonymous visitors can read live
-- listings. Nothing but live listings is ever visible without a session.
create policy listings_select_live on public.listings
  for select to anon, authenticated
  using (status = 'live');

create policy listings_select_own on public.listings
  for select to authenticated
  using (host_id = auth.uid() or public.is_admin());

-- A Host creates their own listings, and only ever as a draft. The move to 'pending' happens
-- via the update policy below, where the lifecycle trigger checks photos and onboarding.
create policy listings_insert_own on public.listings
  for insert to authenticated
  with check (
    host_id = auth.uid()
    and status = 'draft'
    and not public.is_suspended()
  );

-- A Host may edit their listing and move it between draft, pending and paused. They may not
-- put it live - that is the Admin approval step (spec 7.3).
create policy listings_update_own on public.listings
  for update to authenticated
  using (host_id = auth.uid() and not public.is_suspended())
  with check (
    host_id = auth.uid()
    and status in ('draft', 'pending', 'paused')
    and approved_by is null
  );

create policy listings_delete_own_draft on public.listings
  for delete to authenticated
  using (host_id = auth.uid() and status in ('draft', 'rejected'));

create policy listings_admin_all on public.listings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- listing_photos
-- ---------------------------------------------------------------------------

create policy listing_photos_select on public.listing_photos
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.listings l
       where l.id = listing_id
         and (l.status = 'live' or l.host_id = auth.uid() or public.is_admin())
    )
  );

create policy listing_photos_write_own on public.listing_photos
  for all to authenticated
  using (
    exists (select 1 from public.listings l where l.id = listing_id and l.host_id = auth.uid())
  )
  with check (
    exists (select 1 from public.listings l where l.id = listing_id and l.host_id = auth.uid())
  );

create policy listing_photos_admin_all on public.listing_photos
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- listing_agreements
-- ---------------------------------------------------------------------------

create policy listing_agreements_select_own on public.listing_agreements
  for select to authenticated
  using (host_id = auth.uid() or public.is_admin());

-- A signature is written once, by the person signing. There is deliberately no update or
-- delete policy: signed evidence is append-only (assumption A6).
create policy listing_agreements_insert_own on public.listing_agreements
  for insert to authenticated
  with check (
    host_id = auth.uid()
    and exists (
      select 1 from public.listings l where l.id = listing_id and l.host_id = auth.uid()
    )
  );

create policy listing_agreements_admin_select on public.listing_agreements
  for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- availability_blocks
-- ---------------------------------------------------------------------------

-- Seekers need these to render availability on the listing page.
create policy availability_blocks_select on public.availability_blocks
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.listings l
       where l.id = listing_id
         and (l.status = 'live' or l.host_id = auth.uid() or public.is_admin())
    )
  );

create policy availability_blocks_write_own on public.availability_blocks
  for all to authenticated
  using (
    exists (select 1 from public.listings l where l.id = listing_id and l.host_id = auth.uid())
  )
  with check (
    exists (select 1 from public.listings l where l.id = listing_id and l.host_id = auth.uid())
  );

create policy availability_blocks_admin_all on public.availability_blocks
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
-- Read-only for clients by design (rule 1 above). Creation, confirmation, cancellation and
-- completion all run through Edge Functions on the service role.

create policy bookings_select_own on public.bookings
  for select to authenticated
  using (seeker_id = auth.uid() or host_id = auth.uid() or public.is_admin());

create policy bookings_admin_all on public.bookings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
-- The Seeker who paid can see their own payment record; the Host sees their earnings through
-- bookings.host_payout and has no need for the gateway detail.

create policy payments_select_own on public.payments
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.bookings b where b.id = booking_id and b.seeker_id = auth.uid()
    )
  );

create policy payments_admin_all on public.payments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- payouts
-- ---------------------------------------------------------------------------

create policy payouts_select_own on public.payouts
  for select to authenticated
  using (host_id = auth.uid() or public.is_admin());

create policy payouts_admin_all on public.payouts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy payout_bookings_select_own on public.payout_bookings
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.payouts p where p.id = payout_id and p.host_id = auth.uid()
    )
  );

create policy payout_bookings_admin_all on public.payout_bookings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------

create policy reviews_select_public on public.reviews
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.listings l
       where l.id = listing_id
         and (l.status = 'live' or l.host_id = auth.uid() or public.is_admin())
    )
  );

-- Eligibility (booking completed, end time passed, reviewer was a party to it) is checked by
-- the trigger; this policy only establishes authorship.
create policy reviews_insert_own on public.reviews
  for insert to authenticated
  with check (created_by = auth.uid() and not public.is_suspended());

create policy reviews_update_own on public.reviews
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy reviews_admin_all on public.reviews
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- notification_log and admin_audit_log
-- ---------------------------------------------------------------------------

create policy notification_log_select_own on public.notification_log
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy admin_audit_log_admin_only on public.admin_audit_log
  for select to authenticated
  using (public.is_admin());

-- No insert policy on admin_audit_log for any client role: entries are written by Edge
-- Functions on the service role, so an admin cannot author their own audit trail.
