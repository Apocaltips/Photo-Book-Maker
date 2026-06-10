# Photo Book Maker

iOS-first collaborative trip and yearbook app with an Expo client, Next.js web/API app, Supabase-backed shared project storage, S3-compatible photo upload support, live collaborator invites, shared template-driven draft editing, and print-review proof PDF export.

## Workspace

- `apps/mobile`: Expo React Native client with native iOS-first project, upload, curation, editor, draft version, and proof export flows.
- `apps/web`: Next.js web app plus API routes for project creation, uploads, invites, curation, draft editing, preview, print proof, and activity.
- `packages/core`: shared domain types, template catalog, draft lifecycle, proof renderer, and book-generation helpers.

## Local Test Setup

1. Install dependencies:

```bash
npm ci
```

2. Copy `.env.example` to `.env.local` in the repo root.

3. The AI Designer runs locally through Ollama. For the quality-first local
   stack, install the planner, vision, and fallback models:

```bash
ollama pull qwen3:14b
ollama pull qwen2.5vl:7b
ollama pull qwen3:8b
```

Then point the web API at Ollama:

```bash
AI_DRAFT_PROVIDER=ollama
LOCAL_AI_BASE_URL=http://127.0.0.1:11434
LOCAL_AI_PLANNER_MODEL=qwen3:14b
LOCAL_AI_VISION_MODEL=qwen2.5vl:7b
LOCAL_AI_FALLBACK_PLANNER_MODEL=qwen3:8b
```

4. For physical phones, set `EXPO_PUBLIC_API_BASE_URL` to your laptop LAN IP, for example:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.50:3000/api
```

5. Start the shared local API and web app:

```bash
npm run dev:web
```

Open `http://127.0.0.1:3000/ai-health` before tester sessions to confirm
Ollama, required local models, project storage mode, and the latest generation
quality score.

6. In a second terminal, start Expo:

```bash
npm run dev:mobile
```

7. Open the Expo app on the tester phones.

- The web server listens on `0.0.0.0`, so other devices on the same network can reach it.
- In local development without Supabase, shared project state can live in `apps/web/data/projects.json`.
- The phone app depends on the shared API for mutations. Cached books stay visible if the API is offline, but new changes do not save until connectivity returns.
- For USB-connected Android testing, enable Developer Options, turn on USB debugging, accept the PC fingerprint prompt, and confirm `adb devices -l` lists the phone as `device`.

## Hosted Backend Mode

The web API supports hosted mode:

- `Supabase` stores project payloads in `photo_book_projects`
- `S3-compatible object storage` stores uploaded photos
- API responses re-sign stored photo URLs before returning projects to the app

See:

- [`docs/supabase-photo-book-schema.sql`](docs/supabase-photo-book-schema.sql)
- [`docs/go-live-checklist.md`](docs/go-live-checklist.md)
- [`docs/web-alpha-provider-readiness.md`](docs/web-alpha-provider-readiness.md)

## Validation

```bash
npm run test
npm run test:e2e:web
npm run test:ai:health
npm run test:ai:local
npm run typecheck
npm run lint
npm run build
npm run typecheck -w @photo-book-maker/mobile
cd apps/mobile && npx expo-doctor
```

## iOS Preview Build

```bash
cd apps/mobile
npx eas login
npx eas project:init
EXPO_PUBLIC_API_BASE_URL=https://YOUR-WEB-APP/api \
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-SUPABASE-PROJECT.supabase.co \
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-SUPABASE-ANON-KEY \
npx eas build --platform ios --profile preview
```

- iOS bundle identifier: `com.vince.photobookmaker`
- Android package name: `com.vince.photobookmaker`
- Expo config is environment-aware in `apps/mobile/app.config.ts`
- For cloud builds, set `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_ANON_KEY` before running `eas build`
- If you want the build attached to an existing Expo project, also set `EXPO_PUBLIC_EAS_PROJECT_ID`

## Current Scope

- Real iOS photo import from the device library
- Persistent local project cache on the phone
- Shared API state through the Next.js API
- Hosted Supabase-backed project storage when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured
- Remote photo upload flow for S3-compatible storage when `PHOTO_STORAGE_*` variables are configured
- Web project creation, browser photo upload, invite, note, curation, blocker resolution, finalize, draft editor, and print-proof page
- Native mobile template pack, theme, spread copy, spread approval, draft publish/load, preview, and proof export controls
- Local AI Designer generation from imported photos and notes using a 12-pack / 64-spread controlled template catalog
- Proof PDF export from iOS and web print-proof Save-as-PDF handoff
- Finalization checks plus proof PDF export for handoff to a real print vendor

## Not Included Yet

- Direct print-vendor checkout
- Face recognition, live image enhancement, automatic location inference, payments, shipping, tax, SKU mapping, and real print fulfillment
- True realtime multi-cursor editing; v1 uses revision-safe saves, activity, refresh, and conflict prevention

This repo is ready for production-environment configuration and internal iOS distribution testing. Public App Store approval timing is outside engineering control.
