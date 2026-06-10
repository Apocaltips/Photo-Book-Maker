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
`LOCAL_AI_WORKER_SECRET` and `ALPHA_READINESS_SECRET` on the hosted web app,
configure the same worker secret on this PC, set `LOCAL_AI_WORKER_ENABLED=1` on
the hosted app, then run the private worker from this checkout:

```powershell
$env:LOCAL_AI_WORKER_SECRET="same-secret-as-hosted"
$env:LOCAL_AI_WORKER_HOSTED_BASE_URL="https://YOUR-WEB-APP"
$env:LOCAL_AI_WORKER_PROCESSOR_BASE_URL="http://127.0.0.1:3000"
$env:LOCAL_AI_WORKER_PREFLIGHT_ONLY="1"
npm run worker:ai:local
Remove-Item Env:LOCAL_AI_WORKER_PREFLIGHT_ONLY
$env:LOCAL_AI_WORKER_LOOP="1"
npm run worker:ai:local
```

Use `LOCAL_AI_WORKER_PREFLIGHT_ONLY=1` first. It verifies the processor URL is
loopback/LAN/private and checks `/api/ai/local/health` so the worker does not
claim a hosted job before local Ollama and the required models are reachable.
Run `npm run test:worker:preflight` when changing worker environment handling;
it checks the no-network preflight path, required secret, private processor URL
guard, and the explicit hosted-processor override.
Run `npm run test:worker:e2e` before outside tester sessions. It boots an
isolated temp project store, queues a generation job with the worker bridge
enabled, runs the real local worker once against the local processor route,
verifies the completed run and quality report, then runs proof-quality against
the saved draft.
Use `LOCAL_AI_WORKER_LOOP=1` for continuous polling after preflight passes. The
hosted app queues the job; the private worker claims it, runs local Ollama
through the local processor app, heartbeats while the local models are running,
and posts the saved draft back to the hosted app. Keep
`LOCAL_AI_WORKER_PROCESSOR_BASE_URL` pointed at a private local URL. The worker
refuses to use a public processor URL unless
`LOCAL_AI_WORKER_ALLOW_HOSTED_PROCESSOR=1` is set intentionally. Keep
`LOCAL_AI_WORKER_REQUEST_TIMEOUT_MS=30000`,
`LOCAL_AI_WORKER_PROCESS_TIMEOUT_MS=3600000`, and
`LOCAL_AI_WORKER_MAX_ATTEMPTS=3` for family/friend alpha unless a test session
proves the worker needs different limits; expired leases are reclaimed, but a
run that exceeds the attempt ceiling is marked failed and shown on `/ai-health`
instead of being retried forever.
Web and mobile clients poll the generation run status after a queued response,
then refresh the project automatically when the private worker saves or fails
the draft.

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
$env:ALPHA_READINESS_SECRET="same-readiness-secret-as-hosted"
npm run test:alpha:readiness
```

Hosted readiness calls the protected `/api/alpha/readiness` route so the
deployed app reports its own Supabase, R2, project-store, template-catalog, and
private-worker configuration. In hosted mode it also inspects the deployed
project store for active/stale generation runs and requires the latest saved
AI generation to have a quality score at or above
`ALPHA_READINESS_MIN_QUALITY_SCORE` unless
`ALPHA_READINESS_REQUIRE_SAVED_RUN=0` is set intentionally. The route returns
only booleans, counts, mode names, and missing variable names; it never returns
secret values. In hosted mode the CLI skips caller-env checks by default
because the local shell may not match Vercel. Set
`ALPHA_READINESS_CHECK_CALLER_ENV=1` when you also want to verify this PC's
worker-side environment before a tester session.

Before inviting outside testers, also run the hosted alpha smoke against a real
generated proof from the hosted project store:

```powershell
$env:HOSTED_ALPHA_BASE_URL="https://YOUR-WEB-APP"
$env:ALPHA_READINESS_SECRET="same-readiness-secret-as-hosted"
$env:HOSTED_ALPHA_PROOF_BEARER_TOKEN="tester-account-access-token"
$env:HOSTED_ALPHA_PROOF_PROJECT_ID="hosted-project-id-with-saved-ai-generation"
$env:HOSTED_ALPHA_REPORT_PATH="$env:TEMP\\photo-book-hosted-alpha.json"
npm run test:hosted:alpha
```

This wraps the protected hosted readiness route and the proof-quality gate.
Set `HOSTED_ALPHA_REQUIRE_PROOF=0` only for a deployment smoke before a hosted
tester project exists; the outside-tester gate should include proof quality.
The hosted alpha smoke writes a combined report plus companion readiness and
proof-quality reports next to `HOSTED_ALPHA_REPORT_PATH`, or to the system temp
directory when no path is provided.

Phase 2 direct-print readiness has a separate cross-platform command:

```powershell
$env:ALPHA_READINESS_BASE_URL="https://YOUR-WEB-APP"
$env:ALPHA_READINESS_SECRET="same-readiness-secret-as-hosted"
npm run test:provider:readiness
```

That gate is expected to fail until Stripe, transactional email, Sentry,
PostHog, a concrete print provider adapter, and a reviewed sample order are
configured. Phase 1 remains PDF-first; do not treat a missing direct print
provider as a blocker for family/friend proof testing.

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
npm run test:readiness:contract
npm run test:ai:health
npm run test:worker:preflight
npm run test:worker:e2e
npm run test:proof:quality
npm run typecheck
npm run lint
npm run build
npm run typecheck -w @photo-book-maker/mobile
cd apps/mobile && npx expo-doctor
```

`npm run test:ai:alpha-benchmark` is the local outside-tester gate. It
auto-selects the Cap Cana-style small project and the available 50-70 photo
test project, runs both through the isolated benchmark temp store, and writes a
combined `*-summary.json` report without mutating `apps/web/data/projects.json`.
Use `AI_ALPHA_BENCHMARK_SMALL_PROJECT_ID` and `AI_ALPHA_BENCHMARK_60_PROJECT_ID`
when you need to pin exact projects.

`npm run test:ai:benchmark` runs the health gate and a full local generation
smoke against an isolated temporary copy of `apps/web/data/projects.json` and
`apps/web/data/local-uploads`, then writes JSON benchmark reports to the system
temp directory unless `AI_GENERATION_REPORT_PATH` is set. The generation report
records elapsed time, prompt pressure, planner/fallback mode, quality score,
photo usage, template support, planner candidate count, and acceptance
failures. The benchmark now also runs the proof-quality gate against the same
generated project, writes a companion `*-proof-quality.json` report, and
summarizes proof render pass/fail, loaded image checks, layout rhythm, caption
position variety, and photo coverage in the final benchmark output.
Large uploads are pre-curated into a local planner candidate pool capped by
`LOCAL_AI_PLANNER_MAX_PHOTOS`; the local planner context window is controlled by
`LOCAL_AI_PLANNER_NUM_CTX`. Deterministic repair still validates coverage after
the planner returns. Stop any running local Next dev server first; Next
cannot run two dev servers for this app directory. To
intentionally target a running app/store instead, set `AI_BENCHMARK_ISOLATED=0`
and opt into live-store mutation.

`npm run test:ai:local` still targets the current app and requires explicit
opt-in because it saves a generation run to the selected project:

`npm run test:proof:quality` is read-only by default. It boots an isolated
copy of `apps/web/data/projects.json` and `apps/web/data/local-uploads`, fetches
the selected project's print proof, checks that object-storage photos are
re-signed into the proof, verifies rendered image URLs, and fails sparse or
repetitive books with unsupported templates, duplicate photos, missing safe-area
guides, placeholder copy, overfilled pages, or same-corner caption rhythm. Set
`PROOF_QUALITY_PROJECT_ID` or `PROOF_QUALITY_PROJECT_TITLE` to target a specific
book.

```powershell
npm run test:ai:alpha-benchmark
npm run test:ai:benchmark
npm run test:proof:quality
$env:AI_BENCHMARK_PROJECT_IDS="trip-cap-cana-2026-trip-full-album,trip-madeira-island-60-photo-trip-1781039520416"; npm run test:ai:benchmark
$env:AI_GENERATION_PROJECT_ID="trip-madeira-island-60-photo-trip-1781039520416"; $env:AI_GENERATION_CONTEXT_LABEL="Madeira"; $env:AI_GENERATION_CONTEXT_TERMS="madeira"; npm run test:ai:benchmark
$env:PROOF_QUALITY_PROJECT_ID="trip-madeira-island-60-photo-trip-1781039520416"; $env:PROOF_QUALITY_CONTEXT_TERMS="madeira"; npm run test:proof:quality
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
