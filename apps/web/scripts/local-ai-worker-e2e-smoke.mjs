/* global AbortSignal, console, fetch, process */

import { spawn } from "node:child_process";
import { access, copyFile, cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createNextDevServerController, waitForHttpOk } from "./lib/next-dev-server.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const port = process.env.WORKER_E2E_PORT ?? "3223";
const baseUrl = (process.env.WORKER_E2E_BASE_URL ?? `http://127.0.0.1:${port}`).replace(
  /\/$/,
  "",
);
const sourceDataDir = process.env.WORKER_E2E_SOURCE_DATA_DIR
  ? resolve(process.env.WORKER_E2E_SOURCE_DATA_DIR)
  : join(process.cwd(), "data");
const fileStoreDir = await mkdtemp(join(tmpdir(), "photo-book-maker-worker-e2e-"));
const workerSecret = process.env.WORKER_E2E_SECRET ?? "photo-book-worker-e2e-secret";
const workerId = process.env.WORKER_E2E_WORKER_ID ?? "worker-e2e-smoke";
const projectId = process.env.WORKER_E2E_PROJECT_ID;
const projectTitleNeedle = (
  process.env.WORKER_E2E_PROJECT_TITLE ?? "Cap Cana 2026 Trip"
).toLowerCase();
const reportPath = process.env.WORKER_E2E_REPORT_PATH;
const devAuthHeaders = {
  "X-Photo-Book-Dev-Email": process.env.WORKER_E2E_DEV_EMAIL ?? "android-tester@example.com",
  "X-Photo-Book-Dev-Id": process.env.WORKER_E2E_DEV_ID ?? "android-tester",
  "X-Photo-Book-Dev-Name": process.env.WORKER_E2E_DEV_NAME ?? "Android Tester",
};
let server;

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function prepareIsolatedStore() {
  const sourceProjects = join(sourceDataDir, "projects.json");
  if (!(await pathExists(sourceProjects))) {
    throw new Error(`Worker E2E source project store was not found: ${sourceProjects}`);
  }

  await mkdir(fileStoreDir, { recursive: true });
  await copyFile(sourceProjects, join(fileStoreDir, "projects.json"));

  const sourceUploads = join(sourceDataDir, "local-uploads");
  if (await pathExists(sourceUploads)) {
    await cp(sourceUploads, join(fileStoreDir, "local-uploads"), {
      force: true,
      recursive: true,
    });
  }
}

async function detectExistingLocalServer() {
  const probeUrls = [
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3210",
    "http://127.0.0.1:3221",
    "http://127.0.0.1:3222",
    baseUrl,
  ];

  for (const probeUrl of [...new Set(probeUrls)]) {
    try {
      const response = await fetch(probeUrl, {
        signal: AbortSignal.timeout(1_500),
      });
      const text = await response.text();

      if (response.ok && text.includes("Photo Book Maker")) {
        return probeUrl;
      }
    } catch {
      // Keep probing known local dev ports.
    }
  }

  return null;
}

function startServer() {
  return createNextDevServerController({
    baseUrl,
    cwd: process.cwd(),
    env: {
      ...process.env,
      ALPHA_READINESS_SECRET: process.env.ALPHA_READINESS_SECRET ?? "worker-e2e-readiness",
      EXPO_PUBLIC_API_BASE_URL: `${baseUrl}/api`,
      LOCAL_AI_WORKER_ENABLED: "1",
      LOCAL_AI_WORKER_MAX_ATTEMPTS: process.env.LOCAL_AI_WORKER_MAX_ATTEMPTS ?? "2",
      LOCAL_AI_WORKER_MIN_LEASE_SECONDS: process.env.LOCAL_AI_WORKER_MIN_LEASE_SECONDS ?? "1",
      LOCAL_AI_WORKER_SECRET: workerSecret,
      NEXT_PUBLIC_API_BASE_URL: `${baseUrl}/api`,
      NEXT_TELEMETRY_DISABLED: "1",
      PHOTO_BOOK_FILE_STORE_DIR: fileStoreDir,
    },
    label: "Local AI worker E2E server",
    port,
  });
}

async function stopServer() {
  if (server) {
    await server.stop();
  }
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 10_000) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function apiJson(path, init = {}) {
  const response = await fetchWithTimeout(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...devAuthHeaders,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`API call failed ${path}: ${response.status}\n${text.slice(0, 1000)}`);
  }

  return body;
}

async function writeReport(summary) {
  if (!reportPath) {
    return;
  }

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

function runNode(scriptName, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(scriptDir, scriptName)], {
      env: {
        ...process.env,
        ...env,
      },
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${scriptName} exited with code ${code ?? "unknown"}.`));
      }
    });
  });
}

function chooseProject(projects) {
  if (projectId) {
    const match = projects.find((project) => project.id === projectId);
    if (!match) {
      throw new Error(`Could not find worker E2E project ${projectId}.`);
    }

    return match;
  }

  const titleMatch = projects.find((project) =>
    `${project.title ?? ""} ${project.subtitle ?? ""}`.toLowerCase().includes(projectTitleNeedle),
  );
  if (titleMatch) {
    return titleMatch;
  }

  const generatedCandidate = projects
    .filter((project) => (project.photos ?? []).filter((photo) => photo.approved).length >= 6)
    .sort(
      (left, right) =>
        (right.generationRuns?.[0]?.qualityReport?.score ?? 0) -
          (left.generationRuns?.[0]?.qualityReport?.score ?? 0) ||
        (right.photos?.length ?? 0) - (left.photos?.length ?? 0),
    )[0];

  if (generatedCandidate) {
    return generatedCandidate;
  }

  throw new Error("Could not find a worker E2E project with at least six approved photos.");
}

async function main() {
  const existingServer = await detectExistingLocalServer();
  if (existingServer) {
    throw new Error(
      [
        `A Photo Book Maker dev server is already running at ${existingServer}.`,
        "The worker E2E smoke boots an isolated temp project store and cannot share a Next dev app directory.",
        "Stop the existing dev server and rerun.",
      ].join(" "),
    );
  }

  await prepareIsolatedStore();
  server = startServer();
  await server.start();
  await waitForHttpOk(baseUrl, { label: "local AI worker E2E server" });

  const health = await apiJson("/api/ai/local/health");
  if (!health.ai?.ollamaReachable || health.ai?.missingModels?.length) {
    throw new Error(
      `Local AI health failed before worker E2E: ${JSON.stringify(health.ai ?? {})}`,
    );
  }

  const projects = (await apiJson("/api/projects")).projects ?? [];
  const project = chooseProject(projects);
  const questions = await apiJson(`/api/projects/${project.id}/generation/questions`);
  const queueResponse = await apiJson(`/api/projects/${project.id}/generation/run`, {
    method: "POST",
    body: JSON.stringify({
      expectedRevision: project.revision,
      questionnaire: questions.questionnaire.answers,
    }),
  });

  if (queueResponse.run?.status !== "queued") {
    throw new Error(`Worker E2E generation did not queue a run: ${queueResponse.run?.status}`);
  }

  await runNode("local-ai-worker.mjs", {
    LOCAL_AI_WORKER_HEARTBEAT_MS: process.env.LOCAL_AI_WORKER_HEARTBEAT_MS ?? "10000",
    LOCAL_AI_WORKER_HOSTED_BASE_URL: baseUrl,
    LOCAL_AI_WORKER_ID: workerId,
    LOCAL_AI_WORKER_PROCESS_TIMEOUT_MS: process.env.LOCAL_AI_WORKER_PROCESS_TIMEOUT_MS ?? "600000",
    LOCAL_AI_WORKER_PROCESSOR_BASE_URL: baseUrl,
    LOCAL_AI_WORKER_REQUEST_TIMEOUT_MS: process.env.LOCAL_AI_WORKER_REQUEST_TIMEOUT_MS ?? "30000",
    LOCAL_AI_WORKER_SECRET: workerSecret,
  });

  const runStatus = await apiJson(
    `/api/projects/${project.id}/generation/runs/${queueResponse.run.id}`,
  );
  if (runStatus.run?.status !== "saved" || !runStatus.run?.qualityReport) {
    throw new Error(
      `Worker E2E run was not saved with a quality report: ${JSON.stringify(runStatus.run ?? {})}`,
    );
  }

  const proofReportPath = reportPath
    ? reportPath.replace(/\.json$/i, "-proof-quality.json")
    : undefined;
  await runNode("proof-quality-smoke.mjs", {
    PROOF_QUALITY_BASE_URL: baseUrl,
    PROOF_QUALITY_PROJECT_ID: project.id,
    ...(proofReportPath ? { PROOF_QUALITY_REPORT_PATH: proofReportPath } : {}),
  });
  const proofReport = proofReportPath
    ? JSON.parse(await readFile(proofReportPath, "utf8"))
    : null;
  const summary = {
    baseUrl,
    health: {
      missingModels: health.ai?.missingModels ?? [],
      ollamaReachable: Boolean(health.ai?.ollamaReachable),
      plannerMode: health.ai?.plannerStatus?.latestPlannerMode ?? null,
    },
    projectId: project.id,
    projectTitle: project.title,
    proof: proofReport
      ? {
          failures: proofReport.assessment?.failures?.length ?? null,
          imageFailures: proofReport.imageCheck?.failures?.length ?? null,
          pageCount: proofReport.assessment?.pageCount ?? null,
          reportPath: proofReportPath,
          usedPhotoPercent: proofReport.assessment?.usedPhotoPercent ?? null,
        }
      : null,
    reportPath: reportPath ?? null,
    run: {
      deterministicFallbackUsed:
        runStatus.run.modelNames?.planner === "deterministic-editorial-fallback",
      plannerAttemptProgress:
        runStatus.run.progress?.filter((entry) =>
          /^(?:primary planner|fallback planner|deterministic fallback) /.test(entry),
        ) ?? [],
      plannerDiagnostics: runStatus.run.plannerDiagnostics ?? null,
      plannerMode:
        runStatus.run.modelNames?.planner === runStatus.run.modelNames?.fallbackPlanner
          ? "fallback-planner"
          : "primary-or-custom-planner",
      qualityScore: runStatus.run.qualityReport?.score ?? null,
      runId: runStatus.run.id,
      status: runStatus.run.status,
      usedPhotoPercent: runStatus.run.qualityReport?.usedPhotoPercent ?? null,
      validationWarnings: runStatus.run.validationWarnings ?? [],
      workerId: runStatus.run.workerId ?? null,
    },
    status: "local AI worker E2E smoke passed",
    tempStoreDir: fileStoreDir,
    workerId,
  };

  if (summary.run.deterministicFallbackUsed) {
    throw new Error("Worker E2E used deterministic fallback.");
  }

  await writeReport(summary);
  console.log(JSON.stringify(summary, null, 2));
}

try {
  await main();
} finally {
  await stopServer();
  await rm(fileStoreDir, { force: true, recursive: true });
}
