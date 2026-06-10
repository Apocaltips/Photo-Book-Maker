# Go-Live Checklist

This repo can run in two backend modes:

- `file` mode: local JSON store for development
- `supabase` mode: hosted project store in Supabase plus S3-compatible object storage for photos

## 1. Create Supabase

1. Create a new Supabase project.
2. In the SQL editor, run [`docs/supabase-photo-book-schema.sql`](supabase-photo-book-schema.sql).
   The schema enables RLS, revokes `anon` and `authenticated` direct table
   access, and keeps project payload reads/writes behind the Next API service
   role path.
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
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-SUPABASE-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-SUPABASE-ANON-KEY
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
LOCAL_AI_PRIMARY_PLANNER_TIMEOUT_MS=120000
LOCAL_AI_FALLBACK_PLANNER_TIMEOUT_MS=180000
LOCAL_AI_PRIMARY_PLANNER_NUM_PREDICT=1200
LOCAL_AI_FALLBACK_PLANNER_NUM_PREDICT=1200
ALPHA_READINESS_SECRET=<generate-a-24-plus-character-random-secret>
ALPHA_READINESS_REPORT_PATH=
OPENAI_API_KEY=
HOSTED_ALPHA_BASE_URL=
HOSTED_ALPHA_PROOF_BEARER_TOKEN=
HOSTED_ALPHA_PROOF_PROJECT_ID=
HOSTED_ALPHA_PROOF_PROJECT_TITLE=
HOSTED_ALPHA_REQUIRE_PROOF=1
HOSTED_ALPHA_DRY_RUN=0
HOSTED_ALPHA_ALLOW_LOCAL_BASE_URL=0
HOSTED_ALPHA_REPORT_PATH=

STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_TRIP_BOOK_ID=
STRIPE_PRICE_YEARBOOK_ID=
RESEND_API_KEY=
POSTMARK_SERVER_TOKEN=
TRANSACTIONAL_EMAIL_FROM=
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
PRINT_PROVIDER=manual_pdf
PRINT_PROVIDER_API_KEY=
PRINT_PROVIDER_WEBHOOK_SECRET=
PRINT_PROVIDER_PRODUCT_TRIP_SKU=
PRINT_PROVIDER_PRODUCT_YEARBOOK_SKU=
PRINT_PROVIDER_SAMPLE_ORDER_CONFIRMED=0
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
thresholds. The default compact planner budgets are 120 seconds / 1200 output
tokens for `qwen3:14b` and 180 seconds / 1200 output tokens for `qwen3:8b`;
record any overrides next to the benchmark report path. `OPENAI_API_KEY`
remains optional for hosted production or comparison testing.

## 4. Deploy The Web/API App

The authoritative API for v1 is the Next.js app in `apps/web`.

1. Deploy `apps/web` to Vercel or another Next-compatible host.
2. Add the same environment variables to the hosted project.
3. Confirm `https://YOUR-WEB-APP/api/projects` returns an auth-required JSON response.
4. Confirm `https://YOUR-WEB-APP/api/templates` returns at least 12 book template packs and 64 spread templates.
5. In local/staging, confirm `/ai-health` shows the local AI models are ready, queue health is clean, and the latest saved generation has an acceptable quality score before using AI Designer with testers.
6. For hosted web alpha, configure `LOCAL_AI_WORKER_SECRET` and `LOCAL_AI_WORKER_ENABLED=1` on the hosted app. Keep `LOCAL_AI_DIRECT_IN_PRODUCTION=0` so Vercel never tries to call local Ollama directly.
   Use unique random values of at least 24 characters for both
   `LOCAL_AI_WORKER_SECRET` and `ALPHA_READINESS_SECRET`; hosted/provider
   readiness fails short or placeholder-like shared secrets and never returns
   the secret value in its evidence.
7. On the private PC, run `npm run test:worker:preflight`, then
   `npm run test:worker:e2e`, then run the local web app with Ollama and
   storage credentials and run `npm run worker:ai:local` with
   `LOCAL_AI_WORKER_PREFLIGHT_ONLY=1`,
   `LOCAL_AI_WORKER_HOSTED_BASE_URL` pointed at the hosted app, and
   `LOCAL_AI_WORKER_PROCESSOR_BASE_URL` pointed at the local app. Preflight
   must pass before continuous polling starts. Leave
   `LOCAL_AI_WORKER_HEARTBEAT_MS=60000`,
   `LOCAL_AI_WORKER_REQUEST_TIMEOUT_MS=30000`,
   `LOCAL_AI_WORKER_PROCESS_TIMEOUT_MS=3600000`,
   `LOCAL_AI_WORKER_MAX_ATTEMPTS=3`, and the 60-3600 second lease window unless
   a benchmark proves the hosted queue needs different values.
8. Run the local AI benchmark and keep the generated report path with tester-session notes. If the benchmark used the fallback planner or deterministic safe fallback, record that explicitly instead of treating it as a primary-planner pass.
9. Before inviting testers, confirm `/ai-health` shows `Stale runs = 0`; any run that exceeds `LOCAL_AI_WORKER_MAX_ATTEMPTS` should appear as failed instead of staying active.
10. Configure `ALPHA_READINESS_SECRET` on the hosted app, then run
    `npm run test:alpha:readiness` in local mode. After deployment, rerun it
    with `ALPHA_READINESS_MODE=hosted`,
    `ALPHA_READINESS_BASE_URL=https://YOUR-WEB-APP`, and
    `ALPHA_READINESS_SECRET` set in the local shell. Hosted mode calls the
    protected `/api/alpha/readiness` route so the deployed app proves its own
    Supabase, R2, project-store, template-catalog, private-worker setup,
    direct Supabase project-table access denial, synthetic photo upload-ticket
    signing, clean generation queue state, and latest saved AI generation
    quality score.
    Treat any failed check as a no-go for family/friend testers.
11. After one hosted tester project has a saved AI generation, run
    `npm run test:hosted:alpha` with `HOSTED_ALPHA_BASE_URL`,
    `ALPHA_READINESS_SECRET`, `HOSTED_ALPHA_PROOF_BEARER_TOKEN`, and
    `HOSTED_ALPHA_PROOF_PROJECT_ID` or `HOSTED_ALPHA_PROOF_PROJECT_TITLE`.
    This is the outside-tester gate because it proves the deployed app can both
    report readiness and render a real authenticated proof. Keep the combined
    `HOSTED_ALPHA_REPORT_PATH` report and its readiness/proof-quality companion
    reports with the tester-session notes.
12. Leave `PRINT_PROVIDER=manual_pdf` for Phase 1. When direct print checkout
    starts, set `PRINT_PROVIDER` to the selected API candidate, configure the
    Stripe/email/monitoring/print adapter variables, confirm a reviewed sample
    order with `PRINT_PROVIDER_SAMPLE_ORDER_CONFIRMED=1`, then run
    `npm run test:provider:readiness`.

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

Before turning on direct print checkout, the provider-alpha readiness gate must
pass:

```powershell
$env:ALPHA_READINESS_MODE="provider"
$env:ALPHA_READINESS_BASE_URL="https://YOUR-WEB-APP"
$env:ALPHA_READINESS_SECRET="the-same-24-plus-character-random-value-configured-on-the-hosted-app"
npm run test:provider:readiness
```

This command calls the protected app-side readiness route and fails until the
hosted app can prove Supabase/R2/private-worker readiness plus Stripe,
transactional email, Sentry/PostHog, a non-`manual_pdf` print provider adapter,
and `PRINT_PROVIDER_SAMPLE_ORDER_CONFIRMED=1`.

## Required Validation

```bash
npm ci
npm run test
npm run test:readiness:contract
npm run test:alpha:readiness
npm run test:e2e:web
npm run test:ai:health
npm run test:worker:preflight
npm run test:proof:quality
npm run typecheck
npm run lint
npm run build
npm run typecheck -w @photo-book-maker/mobile
cd apps/mobile && npx expo-doctor
```

For hosted outside-tester validation, run `npm run test:hosted:alpha` after
setting the hosted URL, readiness secret, proof bearer token, and hosted
project id/title. It intentionally fails without those hosted values.

The local AI alpha benchmark is isolated by default: it copies the current local
project store and local uploads into a temp directory, starts its own local web
server, runs the small Cap Cana-style project plus the 50-70 photo test project,
runs proof-quality validation against each generated draft, writes generation,
companion `*-proof-quality.json`, and combined `*-summary.json` reports, and
removes the temp store. Keep the summary and companion report paths with
tester-session notes:

```powershell
npm run test:ai:alpha-benchmark
npm run test:ai:benchmark
$env:AI_ALPHA_BENCHMARK_SMALL_PROJECT_ID="trip-cap-cana-2026-trip-full-album"; $env:AI_ALPHA_BENCHMARK_60_PROJECT_ID="trip-madeira-island-60-photo-trip-1781039520416"; npm run test:ai:alpha-benchmark
$env:PROOF_QUALITY_PROJECT_ID="trip-madeira-island-60-photo-trip-1781039520416"; $env:PROOF_QUALITY_CONTEXT_TERMS="madeira"; npm run test:proof:quality
```

For 60+ photo albums, record the `planner saw X/Y photo candidates` and
`planner selected X/Y valid candidate photo ids before repair` progress lines,
plus the `planner returned X unknown photo ids before repair` guardrail and the
`LOCAL_AI_PLANNER_MAX_PHOTOS` / `LOCAL_AI_PLANNER_NUM_CTX` values used for the run.
Also record the companion proof report path, proof page count, image failures,
proof photo usage, layout count, and caption-position spread from the same
benchmark run.

Run `npm run test:proof:quality` after each accepted local AI run. It is
read-only by default and verifies the generated proof, object-storage image
rehydration, rendered image URLs, safe-area guides, template support, photo
coverage, caption-position variety, placeholder-copy rejection, and overfilled
page blocking before a PDF is sent to testers or a print provider.

Only opt into the current local project store when you intentionally want the
validation run saved back into the live project data:

```powershell
$env:AI_BENCHMARK_ISOLATED="0"; $env:AI_GENERATION_ALLOW_EXISTING_STORE="1"; npm run test:ai:benchmark
$env:AI_GENERATION_ALLOW_EXISTING_STORE="1"; npm run test:ai:local
```

## Current Limits

- Direct print-vendor checkout, payment, shipping, tax, SKU mapping, and order tracking are not included in v1.
- AI Designer generation runs locally through Ollama by default when OpenAI is not configured; hosted OpenAI remains optional.
- Public App Store approval by a guaranteed date is not engineering-controllable.
- True realtime multi-cursor editing is not included; v1 uses revision-safe saves, project activity, refresh, and conflict prevention.
