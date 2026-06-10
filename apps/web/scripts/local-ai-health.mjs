/* global AbortSignal, console, fetch, process */

import { access, copyFile, cp, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createNextDevServerController } from "./lib/next-dev-server.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const port = process.env.LOCAL_AI_HEALTH_PORT ?? "3224";
const explicitBaseUrl = process.env.LOCAL_AI_HEALTH_BASE_URL;
const defaultBaseUrl = `http://127.0.0.1:${port}`;
const baseUrl = (explicitBaseUrl ?? defaultBaseUrl).replace(/\/$/, "");
const sourceDataDir = process.env.LOCAL_AI_HEALTH_SOURCE_DATA_DIR
  ? resolve(process.env.LOCAL_AI_HEALTH_SOURCE_DATA_DIR)
  : resolve(scriptDir, "../data");
const strict = process.env.LOCAL_AI_HEALTH_STRICT !== "0";
const requireSavedRun = process.env.LOCAL_AI_HEALTH_REQUIRE_SAVED_RUN !== "0";
const minQualityScore = Number.parseInt(process.env.LOCAL_AI_HEALTH_MIN_SCORE ?? "75", 10);
const disallowDeterministicFallback =
  process.env.LOCAL_AI_HEALTH_DISALLOW_DETERMINISTIC_FALLBACK === "1";
let fileStoreDir;
let serverController;

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function detectExistingBaseUrl() {
  if (explicitBaseUrl) {
    return null;
  }

  const probeUrls = [
    "http://127.0.0.1:3000",
    defaultBaseUrl,
    "http://127.0.0.1:3210",
    "http://127.0.0.1:3221",
    "http://127.0.0.1:3222",
    "http://127.0.0.1:3223",
  ];

  for (const probeUrl of [...new Set(probeUrls)]) {
    try {
      const response = await fetch(probeUrl, {
        signal: AbortSignal.timeout(1_500),
      });
      const text = await response.text();

      if (response.ok && text.includes("Photo Book Maker")) {
        return probeUrl.replace(/\/$/, "");
      }
    } catch {
      // Keep probing known local development ports.
    }
  }

  return null;
}

async function prepareIsolatedStore() {
  fileStoreDir = await mkdtemp(join(tmpdir(), "photo-book-maker-ai-health-"));
  await mkdir(fileStoreDir, { recursive: true });

  const sourceProjects = join(sourceDataDir, "projects.json");
  if (await pathExists(sourceProjects)) {
    await copyFile(sourceProjects, join(fileStoreDir, "projects.json"));
  }

  const sourceUploads = join(sourceDataDir, "local-uploads");
  if (await pathExists(sourceUploads)) {
    await cp(sourceUploads, join(fileStoreDir, "local-uploads"), {
      force: true,
      recursive: true,
    });
  }
}

async function startIsolatedServer() {
  await prepareIsolatedStore();
  serverController = createNextDevServerController({
    baseUrl,
    cwd: process.cwd(),
    env: {
      ...process.env,
      EXPO_PUBLIC_API_BASE_URL: `${baseUrl}/api`,
      NEXT_PUBLIC_API_BASE_URL: `${baseUrl}/api`,
      NEXT_TELEMETRY_DISABLED: "1",
      PHOTO_BOOK_FILE_STORE_DIR: fileStoreDir,
    },
    label: "Local AI health server",
    port,
  });
  await serverController.start();
}

async function stopIsolatedServer() {
  if (serverController) {
    await serverController.stop();
  }
  if (fileStoreDir) {
    await rm(fileStoreDir, { force: true, recursive: true });
  }
}

async function fetchHealth(healthBaseUrl) {
  const healthUrl = `${healthBaseUrl}/api/ai/local/health`;
  let response;

  try {
    response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new Error(
      [
        `Local AI health endpoint was not reachable at ${healthUrl}.`,
        "Set LOCAL_AI_HEALTH_BASE_URL only when targeting an already-running Photo Book Maker app; otherwise the script starts an isolated local server automatically.",
        error instanceof Error ? `Original error: ${error.message}` : null,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `Local AI health endpoint failed: ${response.status} ${JSON.stringify(body)}`,
    );
  }

  return body;
}

async function main() {
  const existingBaseUrl = await detectExistingBaseUrl();
  const healthBaseUrl = existingBaseUrl ?? baseUrl;

  if (!explicitBaseUrl && !existingBaseUrl) {
    await startIsolatedServer();
  }

  const body = await fetchHealth(healthBaseUrl);
  const summary = {
    baseUrl: healthBaseUrl,
    isolated: Boolean(serverController),
    lastSavedRun: body.lastSavedRun
      ? {
          plannerMode: body.plannerStatus?.lastSavedPlannerMode ?? null,
          plannerDiagnostics: body.lastSavedRun.plannerDiagnostics ?? null,
          projectTitle: body.lastSavedRun.projectTitle,
          qualityScore: body.lastSavedRun.qualityReport?.score ?? null,
          runId: body.lastSavedRun.runId,
          status: body.lastSavedRun.status,
          warnings: body.lastSavedRun.validationWarnings?.length ?? 0,
        }
      : null,
    latestRun: body.latestRun
      ? {
          plannerMode: body.plannerStatus?.latestPlannerMode ?? null,
          plannerDiagnostics: body.latestRun.plannerDiagnostics ?? null,
          projectTitle: body.latestRun.projectTitle,
          qualityScore: body.latestRun.qualityReport?.score ?? null,
          runId: body.latestRun.runId,
          status: body.latestRun.status,
          warnings: body.latestRun.validationWarnings?.length ?? 0,
        }
      : null,
    localAiStatus: body.ai?.status,
    missingModels: body.ai?.missingModels ?? [],
    ollamaReachable: body.ai?.ollamaReachable,
    plannerStatus: body.plannerStatus,
    queue: body.queue,
    runtimeConfig: body.ai?.config ?? null,
    sourceDataDir: serverController ? sourceDataDir : null,
    store: body.store,
    tempStoreDir: fileStoreDir ?? null,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!strict) {
    return;
  }

  if (!body.ai?.ollamaReachable) {
    throw new Error("Ollama is not reachable. Start Ollama before tester sessions.");
  }

  if (body.ai?.missingModels?.length) {
    throw new Error(
      `Missing local model(s): ${body.ai.missingModels.join(", ")}. Run ollama pull for each model.`,
    );
  }

  if (body.queue?.activeRuns) {
    throw new Error("A local AI generation run is still active. Wait for it before starting another smoke.");
  }

  if (body.queue?.staleRuns) {
    throw new Error("A local AI generation run has a stale worker lease. Reclaim or fail it before tester sessions.");
  }

  if (requireSavedRun) {
    if (!body.lastSavedRun) {
      throw new Error("No saved AI generation run exists. Run npm run test:ai:local before tester sessions.");
    }

    const qualityScore = body.lastSavedRun.qualityReport?.score;
    if (typeof qualityScore !== "number") {
      throw new Error("The last saved AI generation run does not have a quality report.");
    }

    if (qualityScore < minQualityScore) {
      throw new Error(
        `The last saved AI generation quality score ${qualityScore}/100 is below the ${minQualityScore}/100 alpha gate.`,
      );
    }
  }

  if (
    disallowDeterministicFallback &&
    body.plannerStatus?.deterministicFallbackUsedInLastSaved
  ) {
    throw new Error(
      "The last saved generation used the deterministic fallback. Allow it with LOCAL_AI_HEALTH_DISALLOW_DETERMINISTIC_FALLBACK=0 or tune the local planner.",
    );
  }
}

try {
  await main();
  console.log("local AI health passed");
} finally {
  await stopIsolatedServer();
}
