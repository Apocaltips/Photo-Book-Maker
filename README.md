# Photo Book Maker

Mobile-first collaborative trip and yearbook app with an Expo client, Next.js companion app, hosted Supabase-ready project store support, S3-compatible photo upload support, proof PDF export, and mock print flow.

## Workspace

- `apps/mobile`: Expo React Native client for iOS and Android.
- `apps/web`: Next.js companion app plus API routes that now support either local JSON or hosted Supabase storage.
- `packages/core`: shared domain types, seeded data, and book-generation helpers.

## Local Test Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env.local` in the repo root.

3. For physical phones, set `EXPO_PUBLIC_API_BASE_URL` to your laptop LAN IP, for example:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.50:3000/api
```

4. Start the shared local API and web companion:

```bash
npm run dev:web
```

5. In a second terminal, start Expo:

```bash
npm run dev:mobile
```

6. Open the Expo app on the tester phones.

- The web server is already configured to listen on `0.0.0.0`, so other devices on the same network can reach it.
- In local mode, the shared project state lives in `apps/web/data/projects.json`.
- If the phone app cannot reach the shared API, it falls back to local-only mode and shows that in the UI.

## Hosted Backend Mode

The web API now supports a hosted mode:

- `Supabase` stores project payloads in `photo_book_projects`
- `S3-compatible object storage` stores uploaded photos
- API responses re-sign stored photo URLs before returning projects to the app

See:

- [`docs/supabase-photo-book-schema.sql`](C:\Users\Vince\Desktop\Coding%20Projects\Photo%20Book%20Maker\docs\supabase-photo-book-schema.sql)
- [`docs/go-live-checklist.md`](C:\Users\Vince\Desktop\Coding%20Projects\Photo%20Book%20Maker\docs\go-live-checklist.md)

## Android Tester Build

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli project:init
npx eas-cli build --platform android --profile preview
```

- Android package name: `com.vince.photobookmaker`
- iOS bundle identifier: `com.vince.photobookmaker`
- Expo config is now environment-aware in `apps/mobile/app.config.ts`
- For cloud builds, set `EXPO_PUBLIC_API_BASE_URL` before running `eas build`
- If you want the build attached to an existing Expo project, also set `EXPO_PUBLIC_EAS_PROJECT_ID`

## Current Scope

- Real phone photo import from the device library
- Persistent local project cache on the phone
- Shared API state through the Next.js API
- Hosted Supabase-backed project storage when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured
- Remote photo upload flow for S3-compatible storage when `PHOTO_STORAGE_*` variables are configured
- Draft regeneration from imported photos and notes
- Proof PDF export from the mobile app
- Mock print order progression and project finalization gates

## Not Included Yet

- Real Supabase auth and invite acceptance
- Live AI enhancement, captioning, location inference, face recognition, and real print fulfillment
- Production-grade permissions and secure multi-tenant access rules

This repo is now closer to a hosted tester build, but the final step to a real private mobile test is still deployment plus environment setup.
