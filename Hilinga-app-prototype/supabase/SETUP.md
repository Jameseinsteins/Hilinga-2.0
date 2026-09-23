# Supabase Messaging Setup — Hilinga 2.0 (Free)

Do this once. Takes ~4 minutes. No card needed.

## 1) Create Supabase project (free tier)
1. Go to https://supabase.com and sign in (GitHub).
2. New project -> name it e.g. `hilinga-messaging`, pick a region near you, set a DB password (save it), Create.
3. Wait for the green "Project is ready" check.

## 2) Create the messages table
1. In the Supabase dashboard: left nav -> SQL Editor -> New query.
2. Open this file in your repo: `Hilinga-app-prototype/supabase/business_inquiries.sql`
3. Copy its entire contents, paste into the query editor, click Run.
   - You should see "Success. No rows returned".
4. Confirm: Table Editor -> table `business_inquiries` exists with columns `business_id`, `sender_uid`, `message`, `status`, etc.
5. Optional but recommended: left nav -> Database -> Realtime -> make sure `business_inquiries` is enabled for Realtime (the SQL tries to enable it, but the toggle is the guarantee).

That's the only SQL step. The file is idempotent, so you can paste and Run it again after any future edit.

## 3) Copy the two credentials I need to wire the app
In Supabase: left nav -> Project Settings (gear icon) -> API:
- Project URL: looks like `https://xxxxxxxxxxxx.supabase.co`  -> this is `VITE_SUPABASE_URL`
- Project API keys -> `anon` `public` key (the long eyJ... JWT) -> this is `VITE_SUPABASE_ANON_KEY`
Do NOT copy the `service_role` key - never put that in the frontend.

Send me those two values:
  VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJ...

How to send safely:
- Paste them right here in chat and I will put them in your local `Hilinga-app-prototype/.env` and restart the dev server.
- For deployment (Vercel), you'll also add the same two as Environment Variables there.

## 4) What you can skip
- No Firestore setup, no billing enable, no storage bucket. Firebase Auth stays as-is for your Hilinga logins; only the Inbox/messages DB moves to Supabase.

## 5) What I already did in code
- Added `src/lib/supabase.ts` and `src/lib/business-engagement.ts` Supabase path.
- `VITE_SUPABASE_*` added to `vite-env.d.ts` and `.env.example`.
- SQL migration at `supabase/business_inquiries.sql` (RLS policies permissive for launch; tighten to owner-only later once you add Supabase Auth).

## 6) After you send the two values
I will:
1. Write them to `Hilinga-app-prototype/.env`
2. Run `npm run build` to verify types + bundling
3. Restart `npm run dev` and confirm Inbox realtime (send as traveler -> appears in Business Inbox instantly without refresh)
4. Tell you the Vercel env var names to add so production gets it too.

## Credentials needed (copy-paste template)
VITE_SUPABASE_URL= https://zjhvlefgyffmpbpekpue.supabase.co/rest/v1/
VITE_SUPABASE_ANON_KEY= sb_publishable_XHTAbqWhqhCEnETCtNFh1Q_RbEQPejj

That's it. No table creation on your side beyond the one paste.

## Troubleshooting
- Inbox stuck on "could not be loaded": check the SQL was Run successfully and Realtime is enabled on the table.
- Messages send but business doesn't see them: make sure the business logged in has `user.uid` equal to the `business_id` stored with the inquiry (that's the lookup key).
