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
- `npm run test:ai:benchmark` records elapsed time, prompt pressure, planner/fallback mode, JSON acceptance, duplicate rate, photo usage, unsupported templates, quality score, acceptance failures, and proof-quality pass/fail in JSON reports outside the repo by default.
- Web and mobile uploads fingerprint files before saving them to a project, skip duplicate selections, and report uploaded, failed, and duplicate-skipped counts so testers can retry only the files that need attention.
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
- The worker calls `/api/ai/worker/generation/claim`, processes the payload
  through `/api/ai/worker/generation/process` on the private PC, then posts to
  `/api/ai/worker/generation/complete` or `/api/ai/worker/generation/fail`.
- The worker heartbeats during long local model calls with
  `LOCAL_AI_WORKER_HEARTBEAT_MS` so slow 60-photo and 174-photo test runs are
  not reclaimed as abandoned.
- Worker route calls use `LOCAL_AI_WORKER_REQUEST_TIMEOUT_MS`; local generation
  processing uses `LOCAL_AI_WORKER_PROCESS_TIMEOUT_MS` so hung local requests
  become visible failures instead of leaving the operator guessing.
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
npm run test:alpha:readiness
npm run test:e2e:web
npm run test:ai:health
npm run test:proof:quality
```

`npm run test:alpha:readiness` is read-only. It expects the web app to be
running and checks the home page, auth gate, template catalog, local AI health
in local mode, stale queue state, worker bridge config, and provider env
requirements for the selected mode. Use `ALPHA_READINESS_MODE=local` for local
testing. For the hosted family/friend alpha gate, set
`ALPHA_READINESS_MODE=hosted`, `ALPHA_READINESS_BASE_URL=https://...`, and
`ALPHA_READINESS_SECRET` to the same value configured on the hosted app. Hosted
mode skips local caller-env checks by default and relies on the protected
app-side readiness route; set `ALPHA_READINESS_CHECK_CALLER_ENV=1` when you
also want to verify this PC's worker-side env before inviting testers. In
hosted mode, the protected app-side route also inspects the deployed project
store for active/stale generation runs and requires the latest saved AI
generation to include a quality score at or above
`ALPHA_READINESS_MIN_QUALITY_SCORE` unless
`ALPHA_READINESS_REQUIRE_SAVED_RUN=0` is set intentionally.
`npm run test:ai:health` expects the web app to be running and Ollama to have
the required models installed.
`npm run test:ai:local` expects a reachable Cap Cana-style test project unless
`AI_GENERATION_PROJECT_ID` points at another test project.
`npm run test:proof:quality` is read-only by default: it copies the current
local project store and local uploads into a temp directory, starts a private
Next server, fetches the print proof, verifies rendered image URLs, confirms
fresh object-storage read URLs are used, and blocks sparse/repetitive proofs
with duplicate photos, unsupported templates, placeholder copy, overfilled
pages, missing safe-area guides, or same-position caption rhythm.
`npm run test:ai:benchmark` is isolated by default: it copies the current local
project store and local uploads into a temp directory, starts a private Next
server, runs generation, runs proof-quality validation against the generated
draft, writes generation plus `*-proof-quality.json` reports, and deletes the
temp store. Stop any
running local Next dev server before using it because Next cannot run two dev
servers for this app directory. Large albums are compacted into a curated
planner candidate pool capped by `LOCAL_AI_PLANNER_MAX_PHOTOS`; the benchmark
report should include the `planner saw X/Y photo candidates` and
`planner selected X/Y valid candidate photo ids before repair` progress lines,
plus `planner returned X unknown photo ids before repair` if the model invents
IDs that deterministic repair must remove, and the benchmark summary should
include the companion proof report path, proof page count, image failures, and
proof photo usage. Keep `LOCAL_AI_PLANNER_NUM_CTX` near
the default `8192` on the laptop unless a run needs a larger context; the old
32K context path is too slow for local alpha benchmarking.

Run the 13-photo plus 60-photo matrix from the isolated temp store before
outside tester sessions:

```powershell
$env:AI_BENCHMARK_PROJECT_IDS="trip-cap-cana-2026-trip-full-album,trip-madeira-island-60-photo-trip-1781039520416"; npm run test:ai:benchmark
$env:PROOF_QUALITY_PROJECT_ID="trip-madeira-island-60-photo-trip-1781039520416"; $env:PROOF_QUALITY_CONTEXT_TERMS="madeira"; npm run test:proof:quality
```

Use live-store mutation only when explicitly needed:

```powershell
$env:AI_BENCHMARK_ISOLATED="0"; $env:AI_GENERATION_ALLOW_EXISTING_STORE="1"; npm run test:ai:benchmark
$env:AI_GENERATION_ALLOW_EXISTING_STORE="1"; npm run test:ai:local
```

Do not commit `apps/web/data/projects.json` after intentionally mutating local
AI runs.
