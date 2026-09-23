// Supabase SQL - run in Supabase Dashboard > SQL Editor > New Query > Paste > Run
//
// Idempotent: safe to paste and run again after edits.

-- Extensions
create extension if not exists "pgcrypto";

-- Table: business_inquiries
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

-- Keep updated_at fresh on write
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_business_inquiries_updated_at on public.business_inquiries;
create trigger trg_business_inquiries_updated_at
  before update on public.business_inquiries
  for each row execute function public.set_updated_at();

-- Indexes
create index if not exists idx_business_inquiries_business_id on public.business_inquiries (business_id);
create index if not exists idx_business_inquiries_sender_uid on public.business_inquiries (sender_uid);
create index if not exists idx_business_inquiries_created_at on public.business_inquiries (created_at desc);
create index if not exists idx_business_inquiries_status on public.business_inquiries (status);

-- RLS
alter table public.business_inquiries enable row level security;

-- Permissive policies for now (anon key must be able to write/read):
-- 1) Anyone can INSERT if row has all required fields (length checked by constraints)
-- 2) Anyone can SELECT for now - lock down later to ownerUid once you add Supabase Auth
-- 3) Anyone can UPDATE status only (restrict column via trigger if needed later)

drop policy if exists "anyone_can_insert_inquiry" on public.business_inquiries;
create policy "anyone_can_insert_inquiry" on public.business_inquiries
  for insert with check (true);

drop policy if exists "anyone_can_select_own_business" on public.business_inquiries;
create policy "anyone_can_select_own_business" on public.business_inquiries
  for select using (true);

drop policy if exists "anyone_can_update_status" on public.business_inquiries;
create policy "anyone_can_update_status" on public.business_inquiries
  for update using (true) with check (true);

drop policy if exists "anyone_can_delete_inquiry" on public.business_inquiries;
create policy "anyone_can_delete_inquiry" on public.business_inquiries
  for delete using (true);

-- Realtime: allow business owners to subscribe to inserts/updates on their inquiries
-- Enable Realtime on this table (also toggle in Dashboard > Database > Realtime if needed)
alter publication supabase_realtime add table public.business_inquiries;

-- Verify
-- select * from public.business_inquiries limit 5;
-- select * from pg_policies where tablename='business_inquiries';
