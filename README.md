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
LOCAL_AI_PRIMARY_PLANNER_TIMEOUT_MS=120000
LOCAL_AI_FALLBACK_PLANNER_TIMEOUT_MS=180000
LOCAL_AI_PRIMARY_PLANNER_NUM_PREDICT=1200
LOCAL_AI_FALLBACK_PLANNER_NUM_PREDICT=1200
```

The primary planner is quality-first and can be slow on an 8 GB laptop GPU. The
fallback planner has its own timeout so `qwen3:8b` gets a real chance to return
valid compact JSON before the deterministic editorial fallback takes over.

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
quality score. The page also shows whether the latest saved book used the
primary planner, fallback planner, or the deterministic safe fallback. A safe
fallback can be acceptable for local alpha when the quality score passes, but
it should stay visible instead of being treated like a primary-model success.

For hosted web alpha with local AI, do not expose Ollama. Configure
`LOCAL_AI_WORKER_SECRET` on the hosted web app and this PC, set
`LOCAL_AI_WORKER_ENABLED=1` on the hosted app, then run the private worker from
this checkout:

```powershell
$env:LOCAL_AI_WORKER_SECRET="same-secret-as-hosted"
$env:LOCAL_AI_WORKER_HOSTED_BASE_URL="https://YOUR-WEB-APP"
$env:LOCAL_AI_WORKER_PROCESSOR_BASE_URL="http://127.0.0.1:3000"
npm run worker:ai:local
```

Use `LOCAL_AI_WORKER_LOOP=1` for continuous polling. The hosted app queues the
job; the private worker claims it, runs local Ollama through the local processor
app, heartbeats while the local models are running, and posts the saved draft
back to the hosted app. Keep `LOCAL_AI_WORKER_PROCESSOR_BASE_URL` pointed at a
private local URL. The worker refuses to use a remote hosted URL as its processor
unless `LOCAL_AI_WORKER_ALLOW_HOSTED_PROCESSOR=1` is set intentionally. Keep
`LOCAL_AI_WORKER_MAX_ATTEMPTS=3` for family/friend alpha unless a test session
proves the worker needs a different retry ceiling; expired leases are reclaimed,
but a run that exceeds the attempt ceiling is marked failed and shown on
`/ai-health` instead of being retried forever.

Before inviting outside testers, run the read-only readiness gate against the
running app:

```powershell
$env:ALPHA_READINESS_MODE="local"
npm run test:alpha:readiness
```

For a hosted alpha URL, require real auth/provider/worker gates:

```powershell
$env:ALPHA_READINESS_MODE="hosted"
$env:ALPHA_READINESS_BASE_URL="https://YOUR-WEB-APP"
npm run test:alpha:readiness
```

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
npm run typecheck
npm run lint
npm run build
npm run typecheck -w @photo-book-maker/mobile
cd apps/mobile && npx expo-doctor
```

`npm run test:ai:benchmark` runs the health gate and a full local generation
smoke against an isolated temporary copy of `apps/web/data/projects.json` and
`apps/web/data/local-uploads`, then writes a JSON benchmark report to the system
temp directory unless `AI_GENERATION_REPORT_PATH` is set. The report records
elapsed time, prompt pressure, planner/fallback mode, quality score, photo
usage, template support, planner candidate count, and acceptance failures.
Large uploads are pre-curated into a local planner candidate pool capped by
`LOCAL_AI_PLANNER_MAX_PHOTOS`; the local planner context window is controlled by
`LOCAL_AI_PLANNER_NUM_CTX`. Deterministic repair still validates coverage after
the planner returns. Stop any running local Next dev server first; Next
cannot run two dev servers for this app directory. To
intentionally target a running app/store instead, set `AI_BENCHMARK_ISOLATED=0`
and opt into live-store mutation.

`npm run test:ai:local` still targets the current app and requires explicit
opt-in because it saves a generation run to the selected project:

```powershell
npm run test:ai:benchmark
$env:AI_BENCHMARK_PROJECT_IDS="trip-cap-cana-2026-trip-full-album,trip-madeira-island-60-photo-trip-1781039520416"; npm run test:ai:benchmark
$env:AI_GENERATION_PROJECT_ID="trip-madeira-island-60-photo-trip-1781039520416"; $env:AI_GENERATION_CONTEXT_LABEL="Madeira"; $env:AI_GENERATION_CONTEXT_TERMS="madeira"; npm run test:ai:benchmark
$env:AI_BENCHMARK_ISOLATED="0"; $env:AI_GENERATION_ALLOW_EXISTING_STORE="1"; npm run test:ai:benchmark
$env:AI_GENERATION_ALLOW_EXISTING_STORE="1"; npm run test:ai:local
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
