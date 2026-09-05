-- Parking Marketplace MVP - schema v1
-- Spec: docs/Parking_App_MVP_Preparation_Documentation.docx, section 10 (Data Model).
-- Assumptions: docs/ASSUMPTIONS.md.
--
-- Conventions used throughout:
--   * Money is integer paise (bigint), never numeric or float (assumption A9).
--   * Timestamps are timestamptz stored in UTC; Asia/Kolkata is a display concern only.
--   * Every table gets explicit RLS policies (spec section 11) - see the rls migration.

create extension if not exists postgis with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------

-- Spec section 10: one table, one role field - a person can be both Seeker and Host on a
-- single account. 'host' therefore means "also does everything a seeker can"; it is a
-- promotion, not a separate silo. 'admin' is internal staff only (spec section 8.4).
create type public.user_role as enum ('seeker', 'host', 'admin');

-- KYC-lite: manual document upload reviewed by an Admin (spec section 4.2).
create type public.kyc_status as enum ('not_started', 'pending', 'verified', 'rejected');

-- 'draft' covers a listing being composed but not yet submitted for approval; the spec's
-- four states begin at 'pending' (spec sections 7.2, 8.2).
create type public.listing_status as enum ('draft', 'pending', 'live', 'paused', 'rejected');

create type public.spot_type as enum (
  'open',
  'covered',
  'basement',
  'stilt',
  'garage',
  'driveway'
);

-- Mirrors packages/core/src/booking-state.ts. The trigger in the bookings migration enforces
-- the same transition table, so the database cannot be driven into an illegal state even by
-- a direct API call that bypasses the application (assumption A9).
create type public.booking_status as enum (
  'pending_payment',
  'confirmed',
  'completed',
  'cancelled',
  'payment_failed'
);

create type public.cancelled_by as enum ('seeker', 'host', 'admin', 'system');

create type public.payment_status as enum (
  'created',
  'authorized',
  'captured',
  'failed',
  'refunded',
  'partially_refunded'
);

create type public.payout_status as enum ('pending', 'processing', 'paid', 'failed');

create type public.document_type as enum ('identity_proof', 'address_proof', 'bank_details');

create type public.verification_status as enum ('pending', 'verified', 'rejected');

create type public.notification_channel as enum ('sms', 'whatsapp', 'email');

create type public.notification_status as enum ('queued', 'sent', 'failed');

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'Generic updated_at maintenance trigger, attached to every mutable table.';
