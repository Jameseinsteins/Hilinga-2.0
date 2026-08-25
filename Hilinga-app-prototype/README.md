# Hilinga

Hilinga is a Vite, React, and TypeScript travel companion for Albay. It combines
trip planning, maps, saved places, community reviews, local-business pages,
visitor QR check-ins, and a dedicated business dashboard.

## Local development

From the repository root:

```sh
npm install --prefix Hilinga-app-prototype
npm run dev
```

Copy `.env.example` to `.env.local` and add the Firebase web configuration. The
browser-safe Firebase values identify the project; never put a Firebase service
account or an OpenAI API key in a `VITE_` variable.

## Backend

Firebase Authentication and Cloud Firestore provide the app's durable data and
real-time subscriptions. The checked-in rules enforce per-user saved data,
business ownership, QR consent, customer-inquiry access, private feed likes,
and deduplicated business profile views. IndexedDB keeps saved places and trip
plans usable while offline and syncs queued changes after reconnection.

The AI itinerary generator runs in `api/itinerary.ts` as a Vercel Function. It
requires a Firebase ID token, validates and limits every request, calls OpenAI
with a strict response schema, and returns safe errors with request IDs. The app
falls back to its local itinerary generator if that service is unavailable.

Configure these server-only variables in Vercel:

```text
FIREBASE_WEB_API_KEY=your_firebase_web_api_key
OPENAI_API_KEY=your_server_side_openai_key
OPENAI_ITINERARY_MODEL=gpt-5.6-luna
```

See `FIREBASE_SETUP.md` for the complete Firebase and deployment checklist.

## Verification

```sh
npm run typecheck
npm run lint
npm run build
```

`npm run typecheck` validates both the React app and Vercel API functions.
