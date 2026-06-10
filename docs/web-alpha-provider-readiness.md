# Web Alpha Provider Readiness

This project is moving through two gates:

1. **Local AI alpha**: hosted-looking web UX, local Ollama curation, PDF proof export, and internal/family testing without direct print checkout.
2. **Provider alpha**: real hosted accounts, production storage, checkout, print fulfillment, order status, and sample print orders.

## Phase 1: Local AI Alpha Gate

The app is not ready for outside testers until these are true:

- A tester can create a real account, create a trip/yearbook, upload photos from web, answer the AI Designer questions, generate a book, edit a spread, and save a proof PDF.
- `/ai-health` shows Ollama reachable, `qwen3:14b`, `qwen3:8b`, and `qwen2.5vl:7b` installed, no active stuck runs, and a recent saved run with a quality score.
- `/ai-health` shows queue health plus planner mode for the latest and last successful run. If the app uses `qwen3:8b` or the deterministic safe fallback because `qwen3:14b` times out, that fallback status must stay visible in the page and benchmark report.
- The Cap Cana 13-photo set passes `npm run test:ai:local`; the 60-photo test set must produce 10-14 spreads, use at least 35% of approved photos, include hero/detail/quiet rhythm, and avoid unsupported templates or placeholder copy.
- `npm run test:ai:benchmark` records elapsed time, prompt pressure, planner/fallback mode, JSON acceptance, duplicate rate, photo usage, unsupported templates, quality score, and acceptance failures in a JSON report outside the repo by default.
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

## Validation Commands

Run these before a family/friend testing session:

```bash
npm run test
npm run typecheck
npm run lint
npm run build
npm run test:e2e:web
npm run test:ai:health
```

`npm run test:ai:health` expects the web app to be running and Ollama to have the required models installed. `npm run test:ai:local` expects a reachable Cap Cana-style test project unless `AI_GENERATION_PROJECT_ID` points at another test project.
`npm run test:ai:benchmark` and `npm run test:ai:local` also run a generation
and therefore mutate the selected project by saving a new generation run. They
refuse to target the default local app store unless you opt in:

```powershell
$env:AI_GENERATION_ALLOW_EXISTING_STORE="1"; npm run test:ai:benchmark
$env:AI_GENERATION_ALLOW_EXISTING_STORE="1"; npm run test:ai:local
```

Do not commit `apps/web/data/projects.json` after benchmark-only local runs.
