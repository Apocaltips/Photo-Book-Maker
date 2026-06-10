# Web Alpha Provider Readiness

This project is moving through two gates:

1. **Local AI alpha**: hosted-looking web UX, local Ollama curation, PDF proof export, and internal/family testing without direct print checkout.
2. **Provider alpha**: real hosted accounts, production storage, checkout, print fulfillment, order status, and sample print orders.

## Phase 1: Local AI Alpha Gate

The app is not ready for outside testers until these are true:

- A tester can create a real account, create a trip/yearbook, upload photos from web, answer the AI Designer questions, generate a book, edit a spread, and save a proof PDF.
- `/ai-health` shows Ollama reachable, `qwen3:14b`, `qwen3:8b`, and `qwen2.5vl:7b` installed, no active stuck runs, and a recent saved run with a quality score.
- `/ai-health` shows queue health plus planner mode for the latest and last successful run. If the app uses `qwen3:8b` or the deterministic safe fallback because `qwen3:14b` times out, that fallback status must stay visible in the page and benchmark report.
- Default local planner budgets are `LOCAL_AI_PRIMARY_PLANNER_TIMEOUT_MS=120000`,
  `LOCAL_AI_FALLBACK_PLANNER_TIMEOUT_MS=180000`, and 1200 compact planner output
  tokens per model. Keep those values in each benchmark report so slow
  local-model behavior is visible instead of being mistaken for design quality.
- The Cap Cana 13-photo set passes `npm run test:ai:local`; the 60-photo test set must produce 10-14 spreads, use at least 35% of approved photos, include hero/detail/quiet rhythm, and avoid unsupported templates or placeholder copy.
- `npm run test:ai:benchmark` records elapsed time, prompt pressure,
  planner/fallback mode, per-planner attempt timing, timeout/token/context
  budgets, JSON acceptance, duplicate rate, photo usage, unsupported templates,
  quality score, acceptance failures, and proof-quality pass/fail in JSON
  reports outside the repo by default.
- Web and mobile uploads fingerprint files before saving them to a project, skip duplicate selections, and report uploaded, failed, and duplicate-skipped counts so testers can retry only the files that need attention.
- Web uploads decode JPEG, PNG, and WebP files before requesting upload tickets, keep real image dimensions in the project, reject damaged/non-photo selections, and mark HEIC/HEIF uploads for crop review when the browser cannot read dimensions.
- The generated proof must look photo-first: filled pages, subtle floating photo borders, varied caption positions, safe-area/bleed preview, and no repeated same-corner captions across the book.
- Direct print checkout remains disabled; testers use the PDF proof handoff.

## Phase 2: Provider Alpha Gate

Provider alpha starts only after Phase 1 proof quality is repeatable. Use a narrow physical product surface first:

- **Trip SKU**: one landscape or square photo-book format.
- **Family/yearbook SKU**: one square format.
- Keep the editor's other formats available for internal design testing, but do not expose every SKU in checkout until support, bleed, spine, and reprint handling are proven.

## Required Accounts

- **Frontend/API hosting**: Vercel for the Next.js web/API app.
- **Auth and project metadata**: Supabase Auth plus the `photo_book_projects` table.
- **Photo storage**: Cloudflare R2 using the existing S3-compatible upload/read path.
- **Payments, tax, and checkout**: Stripe Checkout first, then Billing/Tax when annual yearbook plans are introduced.
- **Email**: Resend or Postmark for branded invites, auth support messages, order receipts, and print-status updates.
- **Monitoring**: Sentry for web/mobile errors; PostHog for product funnel analytics.
- **Mobile builds**: Expo EAS for Android preview now and iOS when Apple approval is available.

## Provider Readiness Modes

The readiness gate is intentionally staged so Phase 1 can stay PDF-first while
Phase 2 fails until real provider accounts are configured.

| Mode | Command | Fails On | Notes |
| --- | --- | --- | --- |
| Local AI alpha | `npm run test:alpha:readiness` with `ALPHA_READINESS_MODE=local` | broken app shell, template catalog, local AI health, stale queue, required local checks | Used before internal device testing and Cap Cana/60-photo proof validation. |
| Hosted web alpha | `npm run test:alpha:readiness` with `ALPHA_READINESS_MODE=hosted` | missing hosted Supabase/R2/private-worker config, bad auth gate, direct Supabase project-table exposure, failed photo upload-ticket signing, stale queue, missing saved quality score | Commerce, email, monitoring, and direct print provider gaps are warnings unless explicitly required. |
| Hosted proof alpha | `npm run test:hosted:alpha` | failed hosted readiness, missing tester bearer token, missing hosted project id/title, proof-quality failures | Final gate before family/friend testers because it proves a real hosted generated proof can render with authenticated project access. |
| Provider alpha | `npm run test:provider:readiness` | missing Stripe, email, Sentry/PostHog, direct print provider adapter, or sample-order confirmation | Used only after PDF quality is proven and the first print-provider sandbox/sample path is being wired. |

Provider-alpha environment groups:

| Area | Required Variables |
| --- | --- |
| Stripe checkout | `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_TRIP_BOOK_ID`, `STRIPE_PRICE_YEARBOOK_ID` |
| Transactional email | either `RESEND_API_KEY` or `POSTMARK_SERVER_TOKEN`, plus `TRANSACTIONAL_EMAIL_FROM` |
| Monitoring and analytics | `SENTRY_DSN` or `NEXT_PUBLIC_SENTRY_DSN`, plus `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` |
| Print provider adapter | `PRINT_PROVIDER`, `PRINT_PROVIDER_API_KEY`, `PRINT_PROVIDER_WEBHOOK_SECRET`, `PRINT_PROVIDER_PRODUCT_TRIP_SKU`, `PRINT_PROVIDER_PRODUCT_YEARBOOK_SKU` |
| Sample quality gate | `PRINT_PROVIDER_SAMPLE_ORDER_CONFIRMED=1` after a real sample is reviewed |

Allowed `PRINT_PROVIDER` values are `manual_pdf`, `peecho`, `prodigi`,
`cloudprinter`, `rpi_blurb`, `lulu`, and `gelato`. `manual_pdf` is valid for
Phase 1 but fails provider alpha because direct print checkout needs a real API
target.

## Shared Secret Rules

Hosted readiness and the private AI worker bridge use bearer-style shared
secrets. For hosted/provider alpha, both `ALPHA_READINESS_SECRET` and
`LOCAL_AI_WORKER_SECRET` must be unique random values with at least 24
characters. Do not use copied examples such as `secret`, `test-secret`,
`long-random-readiness-secret`, or `same-readiness-secret-as-hosted`; the
readiness route reports only configured/length/minimum metadata and fails
hosted/provider mode when a value is short or placeholder-like.

## Print Vendor Bake-Off

Do not hard-code a final print vendor before sample orders. Evaluate:

- **Primary candidate: Peecho**. Photo-book-first positioning, print API, white-label workflows, and hardcover/softcover/layflat options make it the current best fit for a photo-book product.
- **Backup candidate: Prodigi**. Strong print-on-demand API and photo-book product coverage.
- **Fallback/redundancy: Cloudprinter**. Useful for broader geographic coverage and redundancy if API/support/sample quality checks pass.
- **Reserve candidates: RPI/Blurb, Lulu, Gelato**. Keep these available if Peecho/Prodigi do not meet quality, API, margin, or shipping requirements.

Bake-off criteria:

- Sandbox/API access, product SKU clarity, cover/interior PDF requirements, bleed/spine specs, sample-order flow, shipping coverage, tracking webhooks, support responsiveness, unit economics, and reprint/refund process.

## Local AI Worker Rule

For hosted web testing before a dedicated AI provider exists, never expose Ollama or `localhost:11434` publicly. The hosted app must enqueue generation work, and a private worker on this PC should poll authenticated jobs, run local models, and post results back. This keeps local AI replaceable by a dedicated API provider later.

Worker bridge v1:

- Hosted web/API: set `LOCAL_AI_WORKER_ENABLED=1` and `LOCAL_AI_WORKER_SECRET`.
- Hosted readiness: also set `ALPHA_READINESS_SECRET` on the hosted app. The
  readiness CLI uses this secret to call `/api/alpha/readiness` and verify the
  deployed server's own Supabase, R2, project-store, template-catalog, and
  private-worker configuration without returning secret values.
- Private PC processor: run the local web app with Ollama and storage credentials available.
- Private PC worker: set `LOCAL_AI_WORKER_HOSTED_BASE_URL` to the hosted app,
  `LOCAL_AI_WORKER_PROCESSOR_BASE_URL` to the local app, and run
  `npm run worker:ai:local`.
- Run the worker once with `LOCAL_AI_WORKER_PREFLIGHT_ONLY=1` before polling.
  Preflight verifies the processor URL is loopback/LAN/private and checks the
  local processor's `/api/ai/local/health` route so a hosted job is not claimed
  before Ollama and the required models are reachable.
- Run `npm run test:worker:preflight` after any worker env or bridge changes.
  The smoke test does not call Ollama or hosted services; it verifies required
  worker secret handling, loopback/LAN processor acceptance, public processor
  rejection, and the explicit `LOCAL_AI_WORKER_ALLOW_HOSTED_PROCESSOR=1`
  override path.
- Run `npm run test:worker:e2e` before outside tester sessions. It boots an
  isolated temp project store, queues a generation job with the worker bridge
  enabled, runs the real worker CLI once against the local processor route,
  verifies the completed saved run and quality report, then runs proof-quality
  against the worker-generated draft.
- The worker calls `/api/ai/worker/generation/claim`, processes the payload
  through `/api/ai/worker/generation/process` on the private PC, then posts to
  `/api/ai/worker/generation/complete` or `/api/ai/worker/generation/fail`.
- Each claimed job is signed with the private worker secret before the worker
  processes it. The signature covers project id, run id, expected revision,
  project payload digest, worker id, and lease token so a tampered job payload
  fails locally. The private processor endpoint also verifies that signed
  envelope, the project digest, and the one-job lease token before running
  generation, so the local model does not process an unsigned or stale job.
- Each claimed job also receives a one-job worker lease token. The hosted app
  stores only its hash, and heartbeat, fail, and complete calls must echo the
  token so stale workers cannot update a run they no longer own.
- The worker heartbeats during long local model calls with
  `LOCAL_AI_WORKER_HEARTBEAT_MS` so slow 60-photo and 174-photo test runs are
  not reclaimed as abandoned.
- Worker route calls use `LOCAL_AI_WORKER_REQUEST_TIMEOUT_MS`; local generation
  processing uses `LOCAL_AI_WORKER_PROCESS_TIMEOUT_MS` so hung local requests
  become visible failures instead of leaving the operator guessing.
- In continuous polling mode, transient hosted-app or processor failures use
  exponential retry backoff based on `LOCAL_AI_WORKER_POLL_MS`, capped by
  `LOCAL_AI_WORKER_BACKOFF_MAX_MS`, with optional
  `LOCAL_AI_WORKER_BACKOFF_JITTER_MS`. Keep
  `LOCAL_AI_WORKER_MAX_CONSECUTIVE_FAILURES=0` for normal alpha operation so
  the private bridge keeps polling after temporary network or model outages.
- Expired leases can be reclaimed by another worker, but
  `LOCAL_AI_WORKER_MAX_ATTEMPTS` limits retry loops. The default alpha ceiling
  is 3 attempts; after that the run is marked failed and `/ai-health` surfaces
  the failed/stale queue state for the operator.
- Web and mobile clients poll `/api/projects/:projectId/generation/runs/:runId`
  after a queued response, then refresh the project automatically when the
  private worker saves or fails the draft. This is required for hosted alpha
  because generation can finish after the original button press returns.
- All worker endpoints require `Authorization: Bearer <LOCAL_AI_WORKER_SECRET>`.
  The processor endpoint is disabled in production unless
  `LOCAL_AI_PROCESSOR_IN_PRODUCTION=1`, because Ollama should run on the private
  worker machine, not inside the hosted app.
- The worker refuses to use a public processor URL unless
  `LOCAL_AI_WORKER_ALLOW_HOSTED_PROCESSOR=1` is set intentionally. In normal
  alpha testing, hosted base URL is public and processor base URL is loopback,
  LAN, or `.local`.

## Validation Commands

Run these before a family/friend testing session:

```bash
npm run test
npm run typecheck
npm run lint
npm run build
npm run test:readiness:contract
npm run test:alpha:readiness
npm run test:e2e:web
npm run test:ai:health
npm run test:worker:preflight
npm run test:proof:quality
```

For the hosted family/friend gate, run:

```powershell
$env:HOSTED_ALPHA_BASE_URL="https://YOUR-WEB-APP"
$env:ALPHA_READINESS_SECRET="the-same-24-plus-character-random-value-configured-on-the-hosted-app"
$env:HOSTED_ALPHA_PROOF_BEARER_TOKEN="tester-account-access-token"
$env:HOSTED_ALPHA_PROOF_PROJECT_ID="hosted-project-id-with-saved-ai-generation"
$env:HOSTED_ALPHA_REPORT_PATH="$env:TEMP\\photo-book-hosted-alpha.json"
npm run test:hosted:alpha
```

`npm run test:hosted:alpha` calls the protected app-side readiness route in
hosted mode, then runs proof-quality against the same hosted base URL using the
provided bearer token and project id/title. Use
`HOSTED_ALPHA_REQUIRE_PROOF=0` only for a temporary deployment smoke before the
first hosted generated project exists. The command writes a combined hosted
alpha report plus `*-readiness.json` and `*-proof-quality.json` companions next
to `HOSTED_ALPHA_REPORT_PATH`, or to the system temp directory by default.

For the Phase 2 direct-print gate, run:

```bash
npm run test:provider:readiness
```

`npm run test:alpha:readiness` is read-only. In local mode, when
`ALPHA_READINESS_BASE_URL` is not set, it auto-detects a running Photo Book
Maker web app or starts an isolated local server on `ALPHA_READINESS_PORT`
(`3225` by default) with a temp copy of the local project store/uploads. It
checks the home page, auth gate, template catalog, local AI health, stale queue
state, worker bridge config, and provider env requirements for the selected
mode without mutating `apps/web/data/projects.json`. Use
`ALPHA_READINESS_MODE=local` for local testing. For the hosted family/friend
alpha gate, set
`ALPHA_READINESS_MODE=hosted`, `ALPHA_READINESS_BASE_URL=https://...`, and
`ALPHA_READINESS_SECRET` to the same strong value configured on the hosted app.
Hosted
mode skips local caller-env checks by default and relies on the protected
app-side readiness route; set `ALPHA_READINESS_CHECK_CALLER_ENV=1` when you
also want to verify this PC's worker-side env before inviting testers. In
hosted mode, the protected app-side route also inspects the deployed project
store for active/stale generation runs and requires the latest saved AI
generation to include a quality score at or above
`ALPHA_READINESS_MIN_QUALITY_SCORE` unless
`ALPHA_READINESS_REQUIRE_SAVED_RUN=0` is set intentionally.
It also probes the `photo_book_projects` table with the public anon key and
fails hosted readiness unless direct table access is denied, because project
payloads must stay behind the Next API service-role path.
For uploads, hosted readiness mints a synthetic JPEG upload ticket without
writing an object; that catches missing or malformed R2/S3 signing config
before a tester tries to upload a trip batch. The upload-ticket route only
accepts JPEG, PNG, WebP, HEIC, and HEIF files.
`npm run test:provider:readiness` is also read-only. It defaults
`ALPHA_READINESS_MODE=provider` and requires the protected readiness route, so
it should fail until hosted auth/storage/private-worker, Stripe, email,
observability, direct print-provider adapter variables, and the reviewed sample
order gate are all configured.
`npm run test:ai:health` is self-contained for local alpha checks: when
`LOCAL_AI_HEALTH_BASE_URL` is not set, it auto-detects a running Photo Book
Maker web app or starts an isolated local server on `LOCAL_AI_HEALTH_PORT`
(`3224` by default), copies the local project store/uploads into a temp
directory, verifies Ollama/model availability, checks for active or stale
generation runs, and confirms the latest saved run meets the configured quality
gate without mutating `apps/web/data/projects.json`. Set
`LOCAL_AI_HEALTH_BASE_URL` only when intentionally targeting a specific running
app/store.
`npm run test:ai:local` expects a reachable Cap Cana-style test project unless
`AI_GENERATION_PROJECT_ID` points at another test project.
`npm run test:proof:quality` is read-only by default: it copies the current
local project store and local uploads into a temp directory, starts a private
Next server, fetches the print proof, verifies rendered image URLs, confirms
fresh object-storage read URLs are used, and blocks sparse/repetitive proofs
with duplicate photos, unsupported templates, placeholder copy, overfilled
pages, missing safe-area guides, or same-position caption rhythm.
`npm run test:ai:alpha-benchmark` is the preferred pre-tester local gate. It
auto-selects the Cap Cana-style small project and the available 50-70 photo
test project, runs both through the isolated benchmark flow, writes a combined
summary report, and fails if either generation/proof quality gate fails or if a
run falls back to the deterministic safe plan. Use
`AI_ALPHA_BENCHMARK_SMALL_PROJECT_ID` and `AI_ALPHA_BENCHMARK_60_PROJECT_ID`
when the local store contains multiple candidates.

`npm run test:ai:benchmark` is isolated by default: it copies the current local
project store and local uploads into a temp directory, starts a private Next
server, runs generation, runs proof-quality validation against the generated
draft, writes generation plus `*-proof-quality.json` reports, and deletes the
temp store. Stop any
running local Next dev server before using it because Next cannot run two dev
servers for this app directory. Large albums are compacted into a curated
planner candidate pool capped by `LOCAL_AI_PLANNER_MAX_PHOTOS`; the benchmark
report should include `plannerDiagnostics`, the `planner saw X/Y photo candidates` and
`planner selected X/Y valid candidate photo ids before repair` progress lines,
plus `planner returned X unknown photo ids before repair` if the model invents
IDs that deterministic repair must remove, and the benchmark summary should
include the companion proof report path, proof page count, image failures, and
proof photo usage. Keep `LOCAL_AI_PLANNER_NUM_CTX` near
the default `8192` on the laptop unless a run needs a larger context; the old
32K context path is too slow for local alpha benchmarking.

`plannerDiagnostics` must preserve prompt byte/token pressure, primary/fallback
attempt timings, timeout budgets, `num_ctx`, `num_predict`, final planner model,
and whether fallback or deterministic fallback was used. If `qwen3:14b` times
out and `qwen3:8b` saves the run, treat it as a visible fallback pass instead
of a primary-planner pass.

Run the 13-photo plus 60-photo matrix from the isolated temp store before
outside tester sessions:

```powershell
npm run test:ai:alpha-benchmark
$env:AI_ALPHA_BENCHMARK_SMALL_PROJECT_ID="trip-cap-cana-2026-trip-full-album"; $env:AI_ALPHA_BENCHMARK_60_PROJECT_ID="trip-madeira-island-60-photo-trip-1781039520416"; npm run test:ai:alpha-benchmark
$env:PROOF_QUALITY_PROJECT_ID="trip-madeira-island-60-photo-trip-1781039520416"; $env:PROOF_QUALITY_CONTEXT_TERMS="madeira"; npm run test:proof:quality
```

Use live-store mutation only when explicitly needed:

```powershell
$env:AI_BENCHMARK_ISOLATED="0"; $env:AI_GENERATION_ALLOW_EXISTING_STORE="1"; npm run test:ai:benchmark
$env:AI_GENERATION_ALLOW_EXISTING_STORE="1"; npm run test:ai:local
```

Do not commit `apps/web/data/projects.json` after intentionally mutating local
AI runs.
