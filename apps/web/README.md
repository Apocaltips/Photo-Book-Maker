# Photo Book Maker Web/API

Next.js web app and authoritative API for the shared Photo Book Maker workspace.

## Local Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## What This App Owns

- Supabase-authenticated project list and project creation
- Collaborator invite creation and invite acceptance
- Signed photo upload tickets for S3-compatible storage
- Project curation: notes, must-include picks, blocker resolution, and finalize checks
- Revision-safe draft, template, page, and publish mutations
- Local AI Designer generation through Ollama with template validation and repair
- Web draft editor, preview, and print-proof Save-as-PDF page
- Template catalog and proof metadata API routes

## Smoke

```bash
npm run test:e2e
```

The smoke boots Next locally, verifies the root page, verifies `/api/templates`, and checks that protected proof routes require auth.

When Supabase and object storage are not configured, local development runs with a dev-only tester identity and local upload storage. The E2E script uses an isolated temp store so it does not write test projects into `apps/web/data/projects.json`.

## Local AI Designer Smoke

With Next running on port 3000 and Ollama serving the local models, run:

```bash
npm run test:ai:local
```

The script finds the Cap Cana test project by default, calls the generation
questionnaire route, runs `/api/projects/:projectId/generation/run`, and fails
if the resulting draft has duplicate approved photos, unsupported templates,
placeholder copy, too few/many spreads, or poor small-batch photo usage.

## Android Local Pairing

For an Android phone or emulator, bind the web/API server to every interface so Expo can reach it:

```bash
npm run dev -- --hostname 0.0.0.0 --port 3000
```

Then start Expo from the mobile workspace:

```bash
cd ../mobile
npm run android:lan
```

The mobile app derives `http://10.0.2.2:3000/api` for the Android emulator and the LAN host for a physical Android phone opened through Expo Go.

## Deploy

Deploy this workspace to Vercel or another Next-compatible host with the variables from [`../../docs/go-live-checklist.md`](../../docs/go-live-checklist.md). The mobile app should point `EXPO_PUBLIC_API_BASE_URL` at this deployment's `/api` URL.
