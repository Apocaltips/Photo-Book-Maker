# Go-Live Checklist

This repo can run in two backend modes:

- `file` mode: local JSON store for development
- `supabase` mode: hosted project store in Supabase plus S3-compatible object storage for photos

## 1. Create Supabase

1. Create a new Supabase project.
2. In the SQL editor, run [`docs/supabase-photo-book-schema.sql`](supabase-photo-book-schema.sql).
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
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-SUPABASE-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-SUPABASE-ANON-KEY

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

AI_DRAFT_PROVIDER=ollama
LOCAL_AI_BASE_URL=http://127.0.0.1:11434
LOCAL_AI_PLANNER_MODEL=qwen3:14b
LOCAL_AI_VISION_MODEL=qwen2.5vl:7b
LOCAL_AI_FALLBACK_PLANNER_MODEL=qwen3:8b
OPENAI_API_KEY=
```

`AI_DRAFT_PROVIDER=ollama` runs the AI Designer through the local Ollama server
instead of a paid API. Pull the local models before testing generation:

```bash
ollama pull qwen3:14b
ollama pull qwen2.5vl:7b
ollama pull qwen3:8b
```

`qwen3:14b` is the planner and caption brain, `qwen2.5vl:7b` analyzes photos,
and `qwen3:8b` is the fallback planner if the larger model fails benchmark
thresholds. `OPENAI_API_KEY` remains optional for hosted production or
comparison testing.

## 4. Deploy The Web/API App

The authoritative API for v1 is the Next.js app in `apps/web`.

1. Deploy `apps/web` to Vercel or another Next-compatible host.
2. Add the same environment variables to the hosted project.
3. Confirm `https://YOUR-WEB-APP/api/projects` returns an auth-required JSON response.
4. Confirm `https://YOUR-WEB-APP/api/templates` returns at least 12 book template packs and 64 spread templates.
5. In local/staging, confirm `/ai-health` shows the local AI models are ready before using AI Designer with testers.

## 5. Point Mobile At The Hosted API

For local iOS or Android testing:

```bash
EXPO_PUBLIC_API_BASE_URL=https://YOUR-WEB-APP/api
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-SUPABASE-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-SUPABASE-ANON-KEY
```

For EAS or release builds, set the same variables in Expo before building.

## 6. Android Local Device Or Emulator Smoke

For Android emulator testing, confirm the device appears first:

```bash
adb devices -l
```

Then run the local web/API server on all interfaces and start Expo:

```bash
cd apps/web
npm run dev -- --hostname 0.0.0.0 --port 3000

cd ../mobile
npm run android:lan
```

For a physical Android phone, install Expo Go, keep the phone on the same Wi-Fi as the PC, and scan the Expo QR code. The app will derive the local API from the Expo host when `EXPO_PUBLIC_API_BASE_URL` is not set.

For USB-connected testing or native install, enable Developer Options on the
phone, turn on USB debugging, accept the PC fingerprint prompt, and verify:

```bash
adb devices -l
```

The phone must show as `device`, not `unauthorized` or absent.

## 7. Build iOS For Internal Test

1. Log in to Expo:

```bash
cd apps/mobile
npx eas login
```

2. Initialize the Expo project if needed:

```bash
npx eas project:init
```

3. Build the iOS preview app:

```bash
npx eas build --platform ios --profile preview
```

4. Install the internal distribution artifact or route it through TestFlight once the Apple project is connected.

## 8. Android Internal Test

Android remains supported by Expo and should pass the same trip creation, upload, curation, editor, publish, finalize, and proof smoke as iOS:

```bash
npx eas build --platform android --profile preview
```

## 9. First Real Test

1. Open the app on iPhone or Android.
2. Create a new trip from iOS or web.
3. Invite the collaborator email from iOS or web.
4. Both accounts upload 25+ photos across iOS and web.
5. Confirm:
   - photos appear on both surfaces after refresh
   - failed uploads do not mutate the project
   - resolution tasks appear when GPS is missing
   - template pack selection persists across iOS and web
   - AI Designer questionnaire defaults load before the editor
   - AI Designer creates 6-8 template-backed spreads from the approved trip photos
   - spread copy edits and approvals persist across iOS and web
   - published drafts can be loaded from both surfaces
   - finalize blocks unresolved tasks and succeeds after resolution
   - iOS proof PDF export works
   - web `/projects/:projectId/proof` can be saved as PDF

## 10. Provider Alpha Accounts

Phase 1 uses PDF proof export only. Before direct print checkout, create and
test accounts for:

- Vercel for hosted web/API
- Supabase for Auth and project metadata
- Cloudflare R2 for S3-compatible original photo storage
- Stripe Checkout, then Stripe Tax/Billing for paid print and yearbook plans
- Resend or Postmark for branded invites and order emails
- Sentry and PostHog for errors, performance, and funnel analytics
- Peecho as the primary print candidate, Prodigi as backup, Cloudprinter as redundancy, with RPI/Blurb, Lulu, and Gelato kept in reserve

Do not expose every book size in checkout first. Start with one trip SKU and
one family/yearbook SKU until bleed, spine, shipping, reprint, support, and
unit economics are proven by sample orders.

## Required Validation

```bash
npm ci
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

## Current Limits

- Direct print-vendor checkout, payment, shipping, tax, SKU mapping, and order tracking are not included in v1.
- AI Designer generation runs locally through Ollama by default when OpenAI is not configured; hosted OpenAI remains optional.
- Public App Store approval by a guaranteed date is not engineering-controllable.
- True realtime multi-cursor editing is not included; v1 uses revision-safe saves, project activity, refresh, and conflict prevention.
