-- Hilinga 2.0 — Full Supabase Migration (Phase 1: DB on Supabase, Auth stays on Firebase)
-- Run in Supabase Dashboard > SQL Editor > New query > Paste > Run
-- Idempotent: safe to paste and Run again after edits.
-- Auth: Firebase uid stored as TEXT (profiles.id, businesses.owner_uid, etc.) because auth.uid() is null with Firebase auth.
-- RLS is permissive (USING true) in Phase 1; app enforces owner_uid = user.uid. Tighten to auth.uid() in Phase 2.

create extension if not exists "pgcrypto";

-- helper: refresh updated_at on UPDATE
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============================================================
-- 1) profiles  (Firestore: profiles/{uid})
-- ============================================================
create table if not exists public.profiles (
  id text primary key,
  account_mode text check (account_mode in ('explore','business')),
  display_name text not null,
  avatar_path text,
  interests text[] not null default '{}',
  language text not null default 'English',
  budget_min int,
  budget_max int,
  notifications_enabled boolean not null default true,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

-- ============================================================
-- 2) businesses  (Firestore: businesses/{ownerUid})
-- ============================================================
create table if not exists public.businesses (
  owner_uid text primary key,
  name text not null,
  business_scale text check (business_scale in ('Small business','Big enterprise')),
  category text,
  location text,
  phone text,
  email text,
  hours text,
  about text,
  cover_url text,
  logo_url text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_businesses_updated_at on public.businesses;
create trigger trg_businesses_updated_at before update on public.businesses for each row execute function public.set_updated_at();

-- ============================================================
-- 3) business_posts  (Firestore: businessPosts/{ownerUid_sourceId})
--    id kept as TEXT = ownerUid_sourceId for deterministic dedup (not uuid)
-- ============================================================
create table if not exists public.business_posts (
  id text primary key,
  owner_uid text not null,
  source_id text,
  business_id text,
  business_name text not null,
  business_category text,
  business_location text,
  business_logo_url text,
  category text check (category in ('Photos & Videos','Events','Promotions')),
  title text not null,
  detail text,
  media_url text,
  media_type text check (media_type in ('image','video')),
  event_date text,
  event_location text,
  promotion_offer text,
  promotion_ends text,
  created_at timestamptz not null default now()
);
create index if not exists idx_bp_owner on public.business_posts(owner_uid);
create index if not exists idx_bp_created on public.business_posts(created_at desc);
create index if not exists idx_bp_category on public.business_posts(category);
create index if not exists idx_bp_business_id on public.business_posts(business_id);

-- ============================================================
-- 4-6) tourist_* (Firestore: touristProfiles/{uid}, touristQrCodes/{token}, touristVisitLogs/{id})
-- ============================================================
create table if not exists public.tourist_profiles (
  owner_uid text primary key,
  tourist_code text,
  first_name text,
  last_name text,
  profile_photo text,
  language text,
  interests text[],
  nationality text,
  country text,
  region text,
  province text,
  city text,
  verification_status text check (verification_status in ('verified','pending')),
  qr_token text unique,
  qr_status text check (qr_status in ('active','disabled','revoked')),
  consent_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_tourist_profiles_updated_at on public.tourist_profiles;
create trigger trg_tourist_profiles_updated_at before update on public.tourist_profiles for each row execute function public.set_updated_at();

create table if not exists public.tourist_qr_codes (
  qr_token text primary key,
  owner_uid text not null,
  status text check (status in ('active','disabled','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tourist_visit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  tourist_id text,
  tourist_code text,
  tourist_name text,
  tourist_country text,
  tourist_province text,
  user_language text,
  user_interests text[],
  business_name text,
  business_location text,
  qr_token text,
  scanned_by text,
  visited_at timestamptz not null default now(),
  scan_method text check (scan_method in ('camera','manual')),
  status text check (status in ('recorded','duplicate')),
  created_at timestamptz not null default now()
);
create index if not exists idx_tvl_business on public.tourist_visit_logs(business_id);
create index if not exists idx_tvl_tourist on public.tourist_visit_logs(tourist_id);
create index if not exists idx_tvl_visited on public.tourist_visit_logs(visited_at desc);

-- ============================================================
-- 7) business_inquiries (already exists, keep idempotent)
-- ============================================================
create table if not exists public.business_inquiries (
  id uuid primary key default gen_random_uuid(),
  business_id text not null,
  business_name text not null,
  sender_uid text not null,
  sender_name text not null,
  sender_email text not null,
  message text not null check (char_length(message) between 10 and 1500),
  status text not null default 'unread' check (status in ('unread','read')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_business_inquiries_updated_at on public.business_inquiries;
create trigger trg_business_inquiries_updated_at before update on public.business_inquiries for each row execute function public.set_updated_at();
create index if not exists idx_business_inquiries_business_id on public.business_inquiries (business_id);
create index if not exists idx_business_inquiries_sender_uid on public.business_inquiries (sender_uid);
create index if not exists idx_business_inquiries_created_at on public.business_inquiries (created_at desc);
create index if not exists idx_business_inquiries_status on public.business_inquiries (status);

-- ============================================================
-- 8) business_post_likes
-- ============================================================
create table if not exists public.business_post_likes (
  post_id text not null,
  user_id text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists idx_bpl_post on public.business_post_likes(post_id);
create index if not exists idx_bpl_user on public.business_post_likes(user_id);

-- ============================================================
-- 9) business_profile_views
-- ============================================================
create table if not exists public.business_profile_views (
  business_id text not null,
  viewer_uid text not null,
  viewed_at timestamptz not null default now(),
  primary key (business_id, viewer_uid)
);
create index if not exists idx_bpv_business on public.business_profile_views(business_id);

-- ============================================================
-- 10) community_posts
-- ============================================================
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_uid text not null,
  author_name text,
  author_avatar_url text,
  place_name text,
  location text,
  category text,
  experience text,
  rating int check (rating between 1 and 5),
  created_at timestamptz not null default now()
);
create index if not exists idx_cp_created on public.community_posts(created_at desc);
create index if not exists idx_cp_author on public.community_posts(author_uid);

-- ============================================================
-- 11-15) per-user offline-first tables (TEXT user_id = Firebase uid)
-- ============================================================
create table if not exists public.saved_places (
  id text not null,
  user_id text not null,
  title text,
  subtitle text,
  kind text,
  image_key text,
  created_at text,
  updated_at text,
  sync_state text,
  deleted boolean not null default false,
  primary key (user_id, id)
);
create index if not exists idx_sp_user on public.saved_places(user_id);

create table if not exists public.trip_plans (
  id text not null,
  user_id text not null,
  title text,
  preferences jsonb,
  itinerary jsonb,
  created_at text,
  updated_at text,
  sync_state text,
  deleted boolean not null default false,
  primary key (user_id, id)
);
create index if not exists idx_tp_user on public.trip_plans(user_id);

create table if not exists public.bookings (
  id text not null,
  user_id text not null,
  trip_plan_id text,
  status text,
  participants int,
  start_date text,
  end_date text,
  pricing jsonb,
  payment_id text,
  payment_status text,
  installments jsonb,
  confirmation_number text,
  notes text,
  created_at text,
  cancelled_at text,
  updated_at text,
  sync_state text,
  deleted boolean not null default false,
  primary key (user_id, id)
);
create index if not exists idx_bookings_user on public.bookings(user_id);

create table if not exists public.payments (
  id text not null,
  user_id text not null,
  booking_id text,
  amount int,
  currency text,
  status text,
  method text,
  transaction_id text,
  receipt_url text,
  failure_reason text,
  retry_count int,
  max_retries int,
  processed_at text,
  refunded_at text,
  created_at text,
  updated_at text,
  sync_state text,
  primary key (user_id, id)
);
create index if not exists idx_payments_user on public.payments(user_id);
create index if not exists idx_payments_booking on public.payments(booking_id);

create table if not exists public.itinerary_edits (
  id text primary key,
  user_id text not null,
  booking_id text,
  trip_plan_id text,
  insert_position int,
  new_stop jsonb,
  created_at text,
  updated_at text,
  sync_state text
);
create index if not exists idx_ie_user on public.itinerary_edits(user_id);
create index if not exists idx_ie_booking on public.itinerary_edits(booking_id);

-- ============================================================
-- RLS: permissive for Phase 1 (Firebase uid != Supabase auth.uid(), so auth.uid() is null)
-- App enforces owner_uid = user.uid. Tighten to auth.uid() in Phase 2 after Supabase Auth cutover.
-- ============================================================
alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_posts enable row level security;
alter table public.tourist_profiles enable row level security;
alter table public.tourist_qr_codes enable row level security;
alter table public.tourist_visit_logs enable row level security;
alter table public.business_inquiries enable row level security;
alter table public.business_post_likes enable row level security;
alter table public.business_profile_views enable row level security;
alter table public.community_posts enable row level security;
alter table public.saved_places enable row level security;
alter table public.trip_plans enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.itinerary_edits enable row level security;

-- helper to (re)create a single permissive policy named phase1_all
-- we drop by name per table then create for all commands

-- profiles
drop policy if exists "phase1_all" on public.profiles;
create policy "phase1_all" on public.profiles for all using (true) with check (true);
drop policy if exists "anyone_can_insert_inquiry" on public.business_inquiries;
drop policy if exists "anyone_can_select_own_business" on public.business_inquiries;
drop policy if exists "anyone_can_update_status" on public.business_inquiries;
drop policy if exists "anyone_can_delete_inquiry" on public.business_inquiries;

-- businesses
drop policy if exists "phase1_all" on public.businesses;
create policy "phase1_all" on public.businesses for all using (true) with check (true);

-- business_posts
drop policy if exists "phase1_all" on public.business_posts;
create policy "phase1_all" on public.business_posts for all using (true) with check (true);

-- tourist
drop policy if exists "phase1_all" on public.tourist_profiles;
create policy "phase1_all" on public.tourist_profiles for all using (true) with check (true);
drop policy if exists "phase1_all" on public.tourist_qr_codes;
create policy "phase1_all" on public.tourist_qr_codes for all using (true) with check (true);
drop policy if exists "phase1_all" on public.tourist_visit_logs;
create policy "phase1_all" on public.tourist_visit_logs for all using (true) with check (true);

-- engagement
drop policy if exists "phase1_all" on public.business_inquiries;
create policy "phase1_all" on public.business_inquiries for all using (true) with check (true);
drop policy if exists "phase1_all" on public.business_post_likes;
create policy "phase1_all" on public.business_post_likes for all using (true) with check (true);
drop policy if exists "phase1_all" on public.business_profile_views;
create policy "phase1_all" on public.business_profile_views for all using (true) with check (true);

-- community
drop policy if exists "phase1_all" on public.community_posts;
create policy "phase1_all" on public.community_posts for all using (true) with check (true);

-- user data
drop policy if exists "phase1_all" on public.saved_places;
create policy "phase1_all" on public.saved_places for all using (true) with check (true);
drop policy if exists "phase1_all" on public.trip_plans;
create policy "phase1_all" on public.trip_plans for all using (true) with check (true);
drop policy if exists "phase1_all" on public.bookings;
create policy "phase1_all" on public.bookings for all using (true) with check (true);
drop policy if exists "phase1_all" on public.payments;
create policy "phase1_all" on public.payments for all using (true) with check (true);
drop policy if exists "phase1_all" on public.itinerary_edits;
create policy "phase1_all" on public.itinerary_edits for all using (true) with check (true);

-- ============================================================
-- Realtime: add all tables to supabase_realtime publication
-- Also toggle in Dashboard > Database > Realtime as guarantee.
-- ============================================================
do $$ begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.businesses;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.business_posts;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.tourist_profiles;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.tourist_qr_codes;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.tourist_visit_logs;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.business_inquiries;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.business_post_likes;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.business_profile_views;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.community_posts;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.saved_places;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.trip_plans;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.bookings;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.payments;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.itinerary_edits;
exception when duplicate_object then null; end $$;

-- ============================================================
-- Storage buckets: avatars (5MB) and business-media (10MB), public read
-- If storage schema not writable from anon, Dashboard > Storage > New bucket is fallback.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('avatars','avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('business-media','business-media', true)
on conflict (id) do nothing;

-- Storage RLS policies (permissive for Phase 1, anon can upload)
-- Drop+create so reruns are safe.
do $$
begin
  -- avatars public read
  drop policy if exists "public read avatars" on storage.objects;
  create policy "public read avatars" on storage.objects for select using (bucket_id = 'avatars');
exception when undefined_object then
  create policy "public read avatars" on storage.objects for select using (bucket_id = 'avatars');
end $$;

do $$
begin
  drop policy if exists "phase1 upload avatars" on storage.objects;
  create policy "phase1 upload avatars" on storage.objects for insert with check (bucket_id = 'avatars');
exception when undefined_object then
  create policy "phase1 upload avatars" on storage.objects for insert with check (bucket_id = 'avatars');
end $$;

do $$
begin
  drop policy if exists "phase1 update avatars" on storage.objects;
  create policy "phase1 update avatars" on storage.objects for update using (bucket_id = 'avatars') with check (bucket_id = 'avatars');
exception when undefined_object then
  create policy "phase1 update avatars" on storage.objects for update using (bucket_id = 'avatars') with check (bucket_id = 'avatars');
end $$;

do $$
begin
  drop policy if exists "phase1 delete avatars" on storage.objects;
  create policy "phase1 delete avatars" on storage.objects for delete using (bucket_id = 'avatars');
exception when undefined_object then
  create policy "phase1 delete avatars" on storage.objects for delete using (bucket_id = 'avatars');
end $$;

do $$
begin
  drop policy if exists "public read business-media" on storage.objects;
  create policy "public read business-media" on storage.objects for select using (bucket_id = 'business-media');
exception when undefined_object then
  create policy "public read business-media" on storage.objects for select using (bucket_id = 'business-media');
end $$;

do $$
begin
  drop policy if exists "phase1 upload business-media" on storage.objects;
  create policy "phase1 upload business-media" on storage.objects for insert with check (bucket_id = 'business-media');
exception when undefined_object then
  create policy "phase1 upload business-media" on storage.objects for insert with check (bucket_id = 'business-media');
end $$;

do $$
begin
  drop policy if exists "phase1 update business-media" on storage.objects;
  create policy "phase1 update business-media" on storage.objects for update using (bucket_id = 'business-media') with check (bucket_id = 'business-media');
exception when undefined_object then
  create policy "phase1 update business-media" on storage.objects for update using (bucket_id = 'business-media') with check (bucket_id = 'business-media');
end $$;

do $$
begin
  drop policy if exists "phase1 delete business-media" on storage.objects;
  create policy "phase1 delete business-media" on storage.objects for delete using (bucket_id = 'business-media');
exception when undefined_object then
  create policy "phase1 delete business-media" on storage.objects for delete using (bucket_id = 'business-media');
end $$;

-- verify helper: uncomment to inspect
-- select tablename from pg_tables where schemaname='public' order by tablename;
-- select * from pg_policies where tablename in ('profiles','businesses','business_posts') limit 20;
-- select * from storage.buckets where id in ('avatars','business-media');
