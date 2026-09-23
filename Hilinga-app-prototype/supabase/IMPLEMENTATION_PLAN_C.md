# Hilinga 2.0 — Supabase Implementation Plan (Option C: Phased)
## DB First, Auth Last — Ultrathink Edition

**Project:** Hilinga-app-prototype (Vite+React+Firebase hilinga-695f8)
**Supabase Project:** https://zjhvlefgyffmpbpekpue.supabase.co (already verified live)
**Strategy:** C — Move all database tables to Supabase while KEEPING Firebase Auth. Auth migrates last.
**Why C:** Zero login breakage. `user.uid` (Firebase string) stays the key for all tables. No password reset forced. Messaging already proves this works (CRUD+realtime PASS).

---

### 1) Current State (audited 2026-09-23)

**Auth (Firebase, stays in Phase 1):**
- `src/lib/firebase.ts` — getAuth, getFirestore, getStorage, browserLocalPersistence
- `src/lib/firebase-auth.ts` — signInWithEmail, createEmailAccount, requestPasswordReset, readableAuthError
- `src/lib/auth.ts` — signInWithGoogle (GoogleAuthProvider + signInWithPopup)
- `src/providers/auth-provider.tsx` — onAuthStateChanged, getCloudProfile, hasBusinessPage, ensureTouristPassport

**Firestore Collections → Supabase Tables (11 files, 14 collections):**
| # | File | Firestore Collection | Supabase Table | Operation | Realtime? | Size |
|---|------|----------------------|----------------|-----------|-----------|------|
| 1 | cloud-profile.ts (204L) | `profiles/{uid}` | `profiles` | get/set (+ avatar Storage) | No (single doc) | Small |
| 2 | business-content.ts (341L) | `businesses/{uid}` | `businesses` | get/set/onSnapshot page | Yes | Small |
| 3 | business-content.ts | `businessPosts/{id}` | `business_posts` | setDoc + query + onSnapshot | Yes | Medium |
| 4 | tourist-passport.ts (298L) | `touristProfiles/{uid}` | `tourist_profiles` | batch commit | No | Small |
| 5 | tourist-passport.ts | `touristQrCodes/{token}` | `tourist_qr_codes` | batch commit | No | Small |
| 6 | tourist-passport.ts + analytics-service.ts (374L) | `touristVisitLogs` | `tourist_visit_logs` | onSnapshot/query analytics | Yes | Large |
| 7 | business-engagement.ts (278L) | `businessInquiries` | `business_inquiries` | **DONE on Supabase** | **YES, PASS** | Small |
| 8 | business-engagement.ts | `businessPostLikes` | `business_post_likes` | onSnapshot/set/delete | Yes | Small |
| 9 | business-engagement.ts | `businessProfileViews` | `business_profile_views` | setDoc/onSnapshot count | Yes | Small |
| 10 | community-feed.ts (80L) | `communityPosts` | `community_posts` | addDoc/onSnapshot/delete | Yes | Small |
| 11 | cloud-user-data.ts (403L) | `users/{uid}/savedPlaces` | `saved_places` | IndexedDB + Firestore sync | No* | Medium |
| 12 | cloud-user-data.ts | `users/{uid}/tripPlans` | `trip_plans` | IndexedDB + Firestore sync | No* | Medium |
| 13 | booking-system.ts (497L) | `users/{uid}/bookings` | `bookings` | IndexedDB + Firestore sync | No* | Medium |
| 14 | booking-system.ts + payment-service.ts (747L) | `users/{uid}/payments` | `payments` | IndexedDB + Firestore sync | No* | Medium |
| 15 | booking-system.ts | `users/{uid}/itineraryEdits` | `itinerary_edits` | IndexedDB + Firestore sync | No* | Small |
| * Offline-first: IndexedDB is source of truth, Firestore is sync. Supabase will mirror this pattern.

**Storage:**
- Firebase Storage: avatars (5MB, getDownloadURL/ref/uploadBytes) in cloud-profile.ts
- Business media: currently dataURL (no Storage), but avatar needs bucket

**IndexedDB (stays, offline layer):**
- `src/lib/database.ts` (3 stores: profiles, saved_items, trip_plans + user_* stores)
- `src/lib/cache-service.ts` (hilinga_cache_v1, 4 stores + business-inquiries fallback)

**Build:** 193 modules, 15s, Vite 6.4.3. No secrets in .env.example exposure.

---

### 2) Target Architecture — Phase 1 (DB on Supabase, Auth on Firebase)

```
[Browser]
  ├─ Firebase Auth (hilinga-695f8) ── user.uid (string) ──┐
  │   onAuthStateChanged, emailVerified, password reset    │
  ├─ Supabase DB (zjhvlefgyffmpbpekpue) ◄──────────────────┘
  │   anon key (sb_publishable_...) + RLS permissive
  │   Postgres + Realtime (postgres_changes per business_id/user_id)
  │   Storage buckets: avatars, business-media
  ├─ IndexedDB (offline, source of truth for bookings/saved)
  └─ Firestore (fallback, still installed, removed after Phase 2)
```

**Key design decision:**
- Supabase tables store `owner_uid` / `business_id` / `user_id` as **TEXT = Firebase uid**, NOT `auth.users.id` FK. Why: Supabase `auth.uid()` is null when Firebase is auth provider, so FK would fail. Text key keeps Phase 1 working without auth migration. Phase 2 will add UUID column `supabase_user_id` and migrate keys then.
- RLS in Phase 1 is **permissive** (`USING true`, `WITH CHECK true`) — required because `auth.role()` ≠ Firebase user. App-level checks enforce ownership (same as business_inquiries now). Lock down to `auth.uid() = owner_uid` in Phase 2 after Supabase Auth cutover.
- Realtime: `supabase.channel('table:owner_uid').on('postgres_changes', {filter: 'owner_uid=eq.'+uid})` + initial fetch, identical to business-engagement.ts pattern (proven PASS).

---

### 3) Supabase Setup — What You Already Did vs What's Left

**DONE (verified live):**
- Project created: zjhvlefgyffmpbpekpue (region auto, free tier 500MB/50k MAU/2GB bandwidth)
- `.env` wired: VITE_SUPABASE_URL=https://zjhvlefgyffmpbpekpue.supabase.co, VITE_SUPABASE_ANON_KEY=sb_publishable_XHTAbqWhqhCEnETCtNFh1Q_...
- Table `business_inquiries` + Realtime channel PASS (INSERT/SELECT/UPDATE/DELETE + realtime event)
- Package @supabase/supabase-js ^2.117.0 installed
- `src/lib/supabase.ts` (persistSession:false client) + `src/lib/business-engagement.ts` Supabase-first

**YOU STILL NEED TO DO (once, 5 min):**
1. Dashboard → SQL Editor → New query → paste `supabase/full_migration.sql` (I will generate) → Run → Success.
2. Dashboard → Database → Realtime → ensure all new tables toggled ON (SQL does `alter publication` but toggle is guarantee).
3. Dashboard → Storage → Create buckets `avatars` (public, 5MB, images/*) and `business-media` (public, 10MB) — or let SQL create them (see migration).
4. No new credentials needed for DB. Keep same 2 env vars for Vercel deploy.

**I NEED FROM YOU:**
- NOTHING for Phase 1 DB. Your 2 keys are enough.
- For Phase 2 Auth (later): only if you want Google Sign-In on Supabase → Google OAuth Client ID/Secret (console.cloud.google.com). Email/password needs nothing.

---

### 4) Full Database Schema — `supabase/full_migration.sql` (to be generated)

Idempotent, rerunnable. Pseudocode (exact SQL next implementation):

```sql
create extension if not exists "pgcrypto";

-- 1. profiles (id text = Firebase uid)
create table if not exists public.profiles (
  id text primary key, -- Firebase uid
  account_mode text check (account_mode in ('explore','business')),
  display_name text not null,
  avatar_path text,
  interests text[] default '{}',
  language text not null default 'English',
  budget_min int, budget_max int,
  notifications_enabled boolean default true,
  onboarding_completed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. businesses (owner_uid text PK)
create table if not exists public.businesses (
  owner_uid text primary key,
  name text not null, business_scale text check (business_scale in ('Small business','Big enterprise')),
  category text, location text, phone text, email text, hours text, about text,
  cover_url text, logo_url text, latitude double precision, longitude double precision,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- 3. business_posts (id uuid, owner_uid text FK-like)
create table if not exists public.business_posts (
  id uuid primary key default gen_random_uuid(),
  owner_uid text not null, business_name text, business_category text, business_location text, business_logo_url text,
  category text check (category in ('Photos & Videos','Events','Promotions')),
  title text not null, detail text, media_url text, media_type text check (media_type in ('image','video')),
  event_date text, event_location text, promotion_offer text, promotion_ends text,
  created_at timestamptz default now()
);
create index if not exists idx_bp_owner on public.business_posts(owner_uid);
create index if not exists idx_bp_created on public.business_posts(created_at desc);

-- 4-6. tourist_* (3 tables)
create table if not exists public.tourist_profiles (owner_uid text primary key, tourist_code text, first_name text, last_name text, profile_photo text, language text, interests text[], nationality text, country text, region text, province text, city text, verification_status text, qr_token text unique, qr_status text, consent_enabled boolean, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists public.tourist_qr_codes (qr_token text primary key, owner_uid text not null, status text, created_at timestamptz, updated_at timestamptz);
create table if not exists public.tourist_visit_logs (id uuid primary key default gen_random_uuid(), business_id text not null, tourist_id text, tourist_code text, tourist_name text, tourist_country text, tourist_province text, user_language text, user_interests text[], business_name text, business_location text, qr_token text, scanned_by text, visited_at timestamptz default now(), scan_method text, status text, created_at timestamptz default now());
create index if not exists idx_tvl_business on public.tourist_visit_logs(business_id);
create index if not exists idx_tvl_visited on public.tourist_visit_logs(visited_at desc);

-- 7. business_inquiries (already exists, alter if needed)
-- 8. business_post_likes
create table if not exists public.business_post_likes (post_id text not null, user_id text not null, created_at timestamptz default now(), primary key (post_id, user_id));
-- 9. business_profile_views
create table if not exists public.business_profile_views (business_id text not null, viewer_uid text not null, viewed_at timestamptz default now(), primary key (business_id, viewer_uid));
-- 10. community_posts
create table if not exists public.community_posts (id uuid primary key default gen_random_uuid(), author_uid text not null, author_name text, author_avatar_url text, place_name text, location text, category text, experience text, rating int check (rating between 1 and 5), created_at timestamptz default now());

-- 11-15. user data (per-user, TEXT user_id = Firebase uid)
create table if not exists public.saved_places (id text not null, user_id text not null, title text, subtitle text, kind text, image_key text, created_at timestamptz, updated_at timestamptz, sync_state text, deleted boolean, primary key (user_id, id));
create table if not exists public.trip_plans (id text not null, user_id text not null, title text, preferences jsonb, itinerary jsonb, created_at timestamptz, updated_at timestamptz, sync_state text, deleted boolean, primary key (user_id, id));
create table if not exists public.bookings (id text not null, user_id text not null, trip_plan_id text, status text, participants int, start_date text, end_date text, pricing jsonb, payment_id text, payment_status text, installments jsonb, confirmation_number text, notes text, created_at text, cancelled_at text, updated_at text, sync_state text, deleted boolean, primary key (user_id, id));
create table if not exists public.payments (id text not null, user_id text not null, booking_id text, amount int, currency text, status text, method text, transaction_id text, receipt_url text, failure_reason text, retry_count int, max_retries int, processed_at text, refunded_at text, created_at text, updated_at text, sync_state text, primary key (user_id, id));
create table if not exists public.itinerary_edits (id text primary key, user_id text not null, booking_id text, trip_plan_id text, insert_position int, new_stop jsonb, created_at text, updated_at text, sync_state text);

-- updated_at triggers (reused function set_updated_at)
-- RLS enable + permissive policies (Phase 1)
-- Realtime publication add all tables
-- Storage buckets via storage.buckets insert (or Dashboard manual)
```

**Indexes:** owner_uid/business_id/user_id + created_at desc on all.
**Storage:** `insert into storage.buckets (id, name, public) values ('avatars','avatars', true)` etc., plus policies.

---

### 5) File-by-File Migration — Code Changes

**Pattern (already proven in business-engagement.ts):**
```ts
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
if (isSupabaseConfigured && supabase) {
  try { /* supabase.from(...).select/insert/update/delete + .channel realtime */ return; }
  catch (e) { console.warn("[file] Supabase fallback:", e); }
}
// fallback: firestore or IndexedDB
```

**a. `src/lib/supabase.ts` (extend)**
- Keep DB client persistSession:false.
- Add second auth client when Phase 2 starts (persistSession:true). For now no change.

**b. `src/lib/cloud-profile.ts` (priority 1)**
- Replace `doc(firestore, "profiles", uid)` / `getDoc` / `setDoc` with `supabase.from("profiles").select().eq("id", uid).single()` / `upsert`.
- Avatar: replace `ref/storage/uploadBytes/getDownloadURL` with `supabase.storage.from("avatars").upload(path, blob)` + `getPublicUrl`.
- Keep localStorage cache + withTimeout pattern, but timeout now 12s for Supabase.
- Fallback to Firestore if Supabase not configured or error.

**c. `src/lib/business-content.ts` (priority 2)**
- `ensureBusinessPage` / `getBusinessPage` / `hasBusinessPage` / `subscribeToOwnedBusinessPage` → `profiles`/`businesses` tables? Actually `businesses` table. `subscribeToOwnedBusinessPage` becomes `supabase.from("businesses").select().eq("owner_uid", uid).maybeSingle()` + channel.
- `publishBusinessPost` / `subscribeToOwnedBusinessPosts` → `business_posts` table with `owner_uid` filter, order by `created_at desc`.
- Keep `cacheBusinessPosts` / `getCachedBusinessPosts` IndexedDB layer.

**d. `src/lib/tourist-passport.ts` (priority 3)**
- `getTouristPassport` / `ensureTouristPassport` / `commitPassport` (batch) → two inserts: tourist_profiles + tourist_qr_codes.
- `recordVisit` / `getVisits` → `tourist_visit_logs`.

**e. `src/lib/analytics-service.ts` (priority 4)**
- `getBusinessVisitorStats` / `getAdminTouristStats` → `supabase.from("tourist_visit_logs").select().eq("business_id", id).gte("visited_at", start)`. Keep aggregation client-side (same logic). Realtime not needed, query only.

**f. `src/lib/community-feed.ts` (priority 5)**
- `subscribeToCommunityPosts` → `supabase.from("community_posts").select().order("created_at", {ascending:false}).limit(100)` + channel on `community_posts`.
- `createCommunityPost` / `deleteCommunityPost`.

**g. `src/lib/business-engagement.ts` (DONE, but extend)**
- Already Supabase-first for inquiries. Add same for likes/views: `business_post_likes` + `business_profile_views`.

**h. `src/lib/cloud-user-data.ts` + `src/lib/booking-system.ts` (priority 6, largest)**
- Both are offline-first: IndexedDB is source, Supabase is sync. Keep `userRows` / `putRow` / `tryFlush` pattern, replace `bookingsCollection(userId)` / `savedCollection` / `paymentsCollection` + `setDoc/deleteDoc/getDocs` with `supabase.from("saved_places"/"trip_plans"/"bookings"/"payments"/"itinerary_edits").upsert/delete/select`.
- `withFirebaseTimeout` → `withSupabaseTimeout`.

**i. `src/lib/payment-service.ts` (priority 7)**
- `createBooking` / `processPayment` doc paths → same tables as booking-system, or keep as wrapper.

**j. Remaining imports `from "@/lib/firebase"`**
- Keep `src/lib/firebase.ts` installed. Each migrated file adds `import { isSupabaseConfigured, supabase }` and guards Firestore calls. No file deletes Firebase import until Phase 2.

---

### 6) RLS, Realtime, Storage — Detailed

**RLS Phase 1 (must be permissive):**
```sql
alter table public.profiles enable row level security;
drop policy if exists "phase1_all" on public.profiles;
create policy "phase1_all" on public.profiles for all using (true) with check (true);
-- repeat for every table
```
Why: Firebase auth token is not Supabase JWT, so `auth.uid()` is null → no row would match. Permissive is correct until Phase 2. App enforces `owner_uid = user.uid` in queries. Same as current messaging.

**RLS Phase 2 (after Supabase Auth):**
```sql
create policy "owner_only" on public.profiles for all using (auth.uid()::text = id) with check (auth.uid()::text = id);
```

**Realtime:**
```sql
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.businesses;
-- ... all 15 tables
```
Also toggle in Dashboard → Database → Realtime. Channel filter uses `owner_uid=eq.<uid>` or `business_id=eq.<uid>`. Tested pattern for inquiries works for all.

**Storage:**
```sql
insert into storage.buckets (id, name, public) values ('avatars','avatars', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('business-media','business-media', true) on conflict (id) do nothing;
create policy "public read avatars" on storage.objects for select using (bucket_id = 'avatars');
create policy "authenticated upload avatars" on storage.objects for insert with check (bucket_id = 'avatars');
-- etc., or make public for Phase 1
```

---

### 7) Implementation Steps — Ordered, Incremental, Zero Downtime

**Step 0: Preparation (30 min, no code)**
- Confirm .env has VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (done).
- Install @supabase/supabase-js (done ^2.117.0).
- Create `supabase/full_migration.sql` + `supabase/SETUP_FULL.md`.

**Step 1: SQL Migration (15 min)**
- You: Run full_migration.sql in SQL Editor → Success.
- You: Verify tables in Table Editor, toggle Realtime.
- Me: Verify via Node smoke test: for each table, insert/select/update/delete + channel subscribe (like inquiries test).

**Step 2: lib/supabase.ts hardening (15 min)**
- Add helper `withSupabaseTimeout`, `isSupabaseConfigured` already there.
- No auth change.

**Step 3: Migrate leaf tables first (2h, low risk)**
- community-feed.ts → community_posts
- analytics-service.ts → tourist_visit_logs reads
- business-engagement.ts likes/views → business_post_likes / business_profile_views
- Each file: Supabase-first + Firestore fallback, `npm run build` after each, dev server hot reload.

**Step 4: Migrate core business tables (3h)**
- cloud-profile.ts → profiles + avatars storage
- business-content.ts → businesses + business_posts
- tourist-passport.ts → tourist_* 3 tables
- Test: create business, publish post, scan QR, analytics — all live on Supabase.

**Step 5: Migrate user data (4h, largest)**
- cloud-user-data.ts + booking-system.ts + payment-service.ts → saved_places/trip_plans/bookings/payments/itinerary_edits
- Keep IndexedDB as source, Supabase as sync. Test: save place, trip, book, pay offline then sync.

**Step 6: Cleanup & Verify (1h)**
- `npm run build` (expect ~195 modules, similar gzip).
- Full smoke: traveler explore → save, business create post → appears, message → realtime, passport scan → log, analytics.
- Update `.env.example` with Supabase vars + docs.

**Step 7: Auth Phase 2 (future, 1 day, separate plan)**
- New Supabase Auth client (persistSession:true).
- New `src/lib/supabase-auth.ts` matching `readableAuthError` / `signInWithEmail` signatures.
- `providers/auth-provider.tsx` dual or switch to `supabase.auth.onAuthStateChange`.
- Add Google provider in Dashboard if needed.
- RLS tighten from `true` to `auth.uid() = owner_uid`.
- Keep Firebase fallback 1 week, then `npm uninstall firebase` after cutover confirmed.

Each step commits separately so you can `git diff` and rollback one file.

---

### 8) Credentials Checklist

**For DB Phase 1 (now):**
- [x] VITE_SUPABASE_URL=https://zjhvlefgyffmpbpekpue.supabase.co (you gave, normalized)
- [x] VITE_SUPABASE_ANON_KEY=sb_publishable_XHTAbqWhqhCEnETCtNFh1Q_RbEQPejj (publishable, new format, verified)
- [ ] Run SQL + enable Realtime (your one-time Dashboard action)
- [ ] Vercel env vars same 2 keys + redeploy (after code lands)

**For Auth Phase 2 (later, only if Google needed):**
- [ ] Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web application) → Authorized redirect URIs: `https://zjhvlefgyffmpbpekpue.supabase.co/auth/v1/callback` → copy Client ID + Secret → Supabase Dashboard → Authentication → Providers → Google → enable + paste.
- [ ] Supabase Dashboard → Authentication → URL Configuration → Site URL = http://localhost:5173, Redirect URLs = http://localhost:5173, https://your-vercel.app
- [ ] No new env vars for auth; same anon key works.

**Never needed:** service_role key, database password, Firebase rotation (stays until Phase 2).

---

### 9) Testing & Verification — Per Step

For each migrated file, run same pattern as inquiries:

```js
const {createClient}=require('@supabase/supabase-js');
const s=createClient(url, key);
// CRUD
await s.from("profiles").upsert({id: "test-uid", display_name:"Test", ...}).select()
await s.from("profiles").select().eq("id","test-uid")
await s.from("profiles").update({display_name:"New"}).eq("id","test-uid")
await s.from("profiles").delete().eq("id","test-uid")
// Realtime
const ch = s.channel("test").on("postgres_changes", {event:"*", schema:"public", table:"profiles", filter:"id=eq.test-uid"}, cb).subscribe()
// expect INSERT event within 3s
```

Plus app-level: `npm run build` must pass, `http://localhost:5173` 200, manual flow traveler/business.

---

### 10) Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| RLS `auth.uid()` null in Phase 1 blocks all writes | App breaks | Use permissive `true` policies (done for inquiries), enforce in app. Tighten only in Phase 2. |
| Firebase uid string vs Supabase uuid mismatch | FK fails | Store uid as TEXT, not UUID, no FK to auth.users in Phase 1. |
| Realtime not firing | Inbox/analytics stale | SQL adds to publication + Dashboard toggle + channel filter; fallback to polling fetchAll. |
| Large tables (visit_logs) scan | Slow analytics | Indexes on business_id + visited_at desc. |
| Offline bookings desync | Data loss | Keep IndexedDB source, Supabase upsert with `syncState`, retry on next load (existing pattern). |
| Build bloat | Larger chunk | Supabase client ~30kb gzip, incremental per file no extra deps. |
| Password import impossible | Auth migration blocks | Phase 1 avoids this; Phase 2 uses fresh signups or dual auth (user re-registers, old Firebase users still login via fallback). |

Rollback: Each file keeps Firestore fallback. If Supabase insert fails, code falls back to Firestore. `git checkout src/lib/cloud-profile.ts` reverts one file. No DB deletion.

---

### 11) Timeline

- **Phase 1 DB (this week):** 1-2 days (SQL 30m + 6h code + 1h test). Can ship messaging + business posts tomorrow, rest day after.
- **Phase 2 Auth (next week, optional):** 1 day + 1 week dual-run.
- **Total to 100% Supabase DB:** 2 days. Auth later when you want.

---

### 12) What I Will Deliver After You Approve

1. `supabase/full_migration.sql` (all tables, indexes, triggers, RLS, realtime, buckets)
2. `supabase/SETUP_FULL.md` (your 5-min Dashboard steps)
3. Migrated lib files (in order above, each build-verified)
4. Updated `vite-env.d.ts` + `.env.example`
5. Live CRUD+realtime test log per table
6. Vercel env var instructions

---

### 13) Your Next Actions to Approve Phase 1

1. Say "approve Phase 1" (or "start with community-feed + cloud-profile first").
2. I generate `full_migration.sql` and start coding file-by-file (you can watch `npm run build` logs).
3. When I push SQL, you run it in Dashboard SQL Editor once and confirm Success.
4. No new credentials until you want Google — keep using same 2 keys.

**First file I will migrate if approved:** `src/lib/cloud-profile.ts` + Storage avatars (since auth-provider depends on it, unblocks everything).

Ready to generate `full_migration.sql` and start?
