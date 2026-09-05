-- Users, KYC-lite documents, and the role helpers every RLS policy depends on.

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
-- Supabase Auth owns identity (auth.users); this table holds the marketplace profile and is
-- the row RLS policies join against. Phone-OTP is the only credential (spec section 7.1), so
-- phone is mirrored here from auth for querying without touching the auth schema.

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text not null unique,
  name text,
  email text,
  role public.user_role not null default 'seeker',
  kyc_status public.kyc_status not null default 'not_started',
  -- Set by an Admin; suspending a Host must immediately delist their listings (spec 7.3).
  suspended_at timestamptz,
  suspended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users is
  'Marketplace profile, 1:1 with auth.users. Spec section 10.';
comment on column public.users.role is
  'seeker | host | admin. A host can also act as a seeker on the same account (spec 8.4).';

create index users_role_idx on public.users (role);
create index users_kyc_status_idx on public.users (kyc_status) where kyc_status = 'pending';

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- Creates the profile row automatically whenever Supabase Auth registers a phone number, so
-- the application never has to do a two-step signup that can half-fail.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, phone, email)
  values (
    new.id,
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone', new.id::text),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------
-- Every RLS policy calls these rather than re-joining public.users. They are STABLE and
-- SECURITY DEFINER so a policy on a table the caller cannot read still resolves correctly,
-- and so a role check never itself trips another policy (which would recurse).

create or replace function public.current_role_value()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' from public.users where id = auth.uid()), false);
$$;

create or replace function public.is_suspended()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select suspended_at is not null from public.users where id = auth.uid()), false);
$$;

comment on function public.is_admin is
  'Server-side admin check. Spec 7.3 requires admin routes be enforced server-side, not in UI.';

-- ---------------------------------------------------------------------------
-- documents - KYC-lite (spec sections 4.2, 7.2, 10)
-- ---------------------------------------------------------------------------
-- file_path points into a PRIVATE Supabase Storage bucket. Never a public URL: these are
-- identity and bank documents and fall under the DPDP Act handling requirement (spec 12).

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type public.document_type not null,
  file_path text not null,
  verified_status public.verification_status not null default 'pending',
  reviewed_by uuid references public.users (id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint documents_review_is_complete check (
    (verified_status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (verified_status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
  ),
  constraint documents_rejection_has_reason check (
    verified_status <> 'rejected' or rejection_reason is not null
  )
);

comment on table public.documents is
  'Manually reviewed KYC-lite documents. Live e-KYC is deferred (spec 4.2, 9.8).';

create index documents_user_id_idx on public.documents (user_id);
create index documents_pending_idx on public.documents (verified_status)
  where verified_status = 'pending';

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- One live document of each type per user: a resubmission replaces the previous attempt
-- rather than leaving an Admin guessing which of three uploads is current.
create unique index documents_one_active_per_type_idx
  on public.documents (user_id, type)
  where verified_status <> 'rejected';

-- A Host cannot submit a listing for approval until identity, address, and bank details are
-- all on file (spec 7.2: "onboarding cannot be skipped before a first listing can be
-- submitted for approval"). Checked here so the rule holds regardless of entry point.
create or replace function public.host_onboarding_complete(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct type) = 3
  from public.documents
  where user_id = p_user_id
    and verified_status in ('pending', 'verified');
$$;
