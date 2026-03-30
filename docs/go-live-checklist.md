# Go-Live Checklist

This repo can now run in two backend modes:

- `file` mode: local JSON store for development
- `supabase` mode: hosted project store in Supabase plus S3-compatible object storage for photos

## 1. Create Supabase

1. Create a new Supabase project.
2. In the SQL editor, run [`docs/supabase-photo-book-schema.sql`](C:\Users\Vince\Desktop\Coding%20Projects\Photo%20Book%20Maker\docs\supabase-photo-book-schema.sql).
3. Copy:
   - `Project URL`
   - `anon` key
   - `service_role` key

## 2. Create Object Storage

Recommended: Cloudflare R2

1. Create a bucket for photos, for example `photo-book-maker`.
2. Create an API token with object read/write access for that bucket.
3. Copy:
   - bucket name
   - S3 endpoint
   - access key id
   - secret access key

## 3. Set Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_API_BASE_URL=https://YOUR-WEB-APP/api
EXPO_PUBLIC_API_BASE_URL=https://YOUR-WEB-APP/api

SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_PROJECTS_TABLE=photo_book_projects

PHOTO_STORAGE_BUCKET=photo-book-maker
PHOTO_STORAGE_ENDPOINT=https://YOUR-ACCOUNT-ID.r2.cloudflarestorage.com
PHOTO_STORAGE_REGION=auto
PHOTO_STORAGE_ACCESS_KEY_ID=...
PHOTO_STORAGE_SECRET_ACCESS_KEY=...
PHOTO_STORAGE_PUBLIC_BASE_URL=
PHOTO_STORAGE_FORCE_PATH_STYLE=false
```

## 4. Deploy the Web/API App

The current easiest hosted API for this repo is the Next.js app in `apps/web`.

1. Deploy `apps/web` to Vercel.
2. Add the same environment variables to the Vercel project.
3. Confirm `https://YOUR-WEB-APP/api/projects` returns JSON.

## 5. Point the Mobile App at the Hosted API

For local Android testing:

```bash
EXPO_PUBLIC_API_BASE_URL=https://YOUR-WEB-APP/api
```

For EAS or release builds, set the same variable in Expo/Vercel environments before building.

## 6. Build Android for Internal Test

1. Log in to Expo:

```bash
cd apps/mobile
npx eas-cli login
```

2. Initialize the Expo project if needed:

```bash
npx eas-cli project:init
```

3. Build the Android app:

```bash
npx eas-cli build --platform android --profile preview
```

4. Download the `.aab` or `.apk` build artifact.

## 7. Upload to Google Play Internal Testing

1. Create the app in Play Console if you have not already.
2. Go to `Testing > Internal testing`.
3. Add only your Gmail and your girlfriend's Gmail as testers.
4. Upload the Android App Bundle.
5. Publish the internal release.
6. Share the private opt-in link.

## 8. First Real Test

1. Open the app on your phone.
2. Create a new trip.
3. Invite your girlfriend's email.
4. Both of you upload 3-10 photos.
5. Confirm:
   - photos appear on both devices
   - resolution tasks appear when GPS is missing
   - proof/export tab still works
   - print tab advances mock order state

## Current Limits

- The backend is now hostable, but auth is still tester-mode rather than full magic-link production auth.
- The mobile app can upload photos to S3-compatible object storage, but the full AI enhancement/captioning pipeline is still not wired to live providers.
- Print fulfillment is still mocked.
