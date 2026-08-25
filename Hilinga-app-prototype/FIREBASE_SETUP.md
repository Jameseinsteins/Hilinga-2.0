# Hilinga Firebase setup

The app uses Firebase Authentication and Cloud Firestore. Business pages,
compressed business photos, and feed posts work without Cloud Storage so the
prototype can stay on Firebase's Spark plan.

## Enabled services

- Authentication: Email/Password and Google
- Firestore Database
- Storage (optional, only for larger files or profile avatars)

Under Authentication > Settings > Authorized domains, add every web hostname
that will run Hilinga. Add `localhost` for local web development if it is not
already listed, and add the production hostname before deployment.

The local Firebase web configuration belongs in `.env.local`; copy the variable
names from `.env.example`. Firebase web configuration identifies the project but
is not a server secret. Never add a service-account private key to the app.

## Security rules

Install the Firebase CLI, sign in, then deploy the checked-in Firestore rules:

```sh
firebase deploy --only firestore:rules --project hilinga-web-app
```

Keep `VITE_FIREBASE_STORAGE_ENABLED=false` until the project's default Cloud
Storage bucket has been created and the Storage rules above have been deployed.
Then set it to `true` and restart the app. Profile setup still works while
Storage is disabled; selected photos are session-only until cloud uploads are
enabled.

Profiles are stored at `profiles/{uid}`, including the account's Explore or
Business mode so the same experience opens on every device. Public business
pages are stored at `businesses/{uid}` and shared business posts are stored at
`businessPosts/{postId}`. Compressed photos are stored directly in those
Firestore documents. Any authenticated user can read those business pages and
posts, while only the owning business account can change them. Saved places and
trip plans are stored under `users/{uid}/savedPlaces/{placeId}` and
`users/{uid}/tripPlans/{planId}`. Firestore rules allow an authenticated user to
read and write only their own documents and validate the fields written by the
app. Avatars are stored below `avatars/{uid}` and are limited to authenticated
owners, image content, and 25 MB.

On the first signed-in launch after upgrading, Hilinga assigns existing local
saved places and trip plans to that authenticated account and uploads them. The
assignment is recorded on the device so the same legacy data is never offered
to a second account. New changes are written to a user-scoped IndexedDB cache
first; if Firestore is offline or times out, they stay queued locally and sync
on a later load. A successful cloud load refreshes that cache, making the same
data available on other devices.

The current Vite web build cannot open a native SQLite database directly. If a
native build previously stored these tables in SQLite, keep its existing
SQLite-to-web/local migration step in the upgrade path; once those rows reach
the local `saved_items` and `trip_plans` stores, the one-time cloud migration
above claims and syncs them safely.

After changing `firestore.rules`, deploy the rules before testing writes from a
client. No service-account credential or private key belongs in `.env.local`,
the web bundle, or this repository.

Firestore is authoritative for business pages and posts. Business mode does not
read or write browser local storage. The free implementation supports compressed
photos; video posts require a separate file-storage service and are disabled.

Profile QR data uses the existing `touristProfiles/{uid}` and
`touristQrCodes/{token}` collection names for backward compatibility.
Successful business scans create records in `touristVisitLogs/{visitId}`.
Deploy the checked-in Firestore rules before testing this flow: QR documents
contain only a revocable token, while the approved user-profile snapshot and
visit log hold the display fields needed for check-in.

Set `VITE_PUBLIC_APP_URL` to the public origin of the deployed app before
building for production. Profile QR images encode this origin and route an
authenticated business owner to the Visitors logbook. The app falls back to
the current browser origin for local development. After a valid scan, one visit
record updates both the business Visitors logbook and the tourist's My Visits
list in real time. Repeat scans by the same business within 30 minutes are
treated as duplicates and do not create another visit.

## Native Google sign-in

Web Google sign-in works through Firebase's popup flow. Android and iOS builds
also require platform OAuth client IDs from Google Cloud/Firebase:

```text
EXPO_PUBLIC_FIREBASE_GOOGLE_ANDROID_CLIENT_ID=
EXPO_PUBLIC_FIREBASE_GOOGLE_IOS_CLIENT_ID=
```

Before creating those clients, set the final `android.package` and
`ios.bundleIdentifier` values in `app.json`. Add the corresponding SHA-1/SHA-256
certificate fingerprints for Android in Firebase Project settings.
