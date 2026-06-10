/* global AbortSignal, console, fetch, process */

import { spawn } from "node:child_process";
import { access, copyFile, cp, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createNextDevServerController } from "./lib/next-dev-server.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const reportPath =
  process.env.AI_GENERATION_REPORT_PATH ??
  join(tmpdir(), `photo-book-local-ai-benchmark-${Date.now()}.json`);
const isolated = process.env.AI_BENCHMARK_ISOLATED !== "0";
const port = process.env.AI_BENCHMARK_PORT ?? "3221";
const baseUrl = (process.env.AI_BENCHMARK_BASE_URL ?? `http://127.0.0.1:${port}`).replace(
  /\/$/,
  "",
);
const sourceDataDir = process.env.AI_BENCHMARK_SOURCE_DATA_DIR
  ? resolve(process.env.AI_BENCHMARK_SOURCE_DATA_DIR)
  : join(process.cwd(), "data");
const fileStoreDir = isolated
  ? await mkdtemp(join(tmpdir(), "photo-book-maker-ai-benchmark-"))
  : undefined;
let server;

function parseList(value) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "project";
}

function getBenchmarkTargets() {
  const targets = [
    ...parseList(process.env.AI_BENCHMARK_PROJECT_IDS).map((projectId) => ({
      projectId,
    })),
    ...parseList(process.env.AI_BENCHMARK_PROJECT_TITLES).map((projectTitle) => ({
      projectTitle,
    })),
  ];

  if (targets.length) {
    return targets;
  }

  return [
    {
      projectId: process.env.AI_GENERATION_PROJECT_ID,
      projectTitle: process.env.AI_GENERATION_PROJECT_TITLE,
    },
  ];
}

function getTargetReportPath(target, index, total) {
  if (total === 1) {
    return reportPath;
  }

  const extension = extname(reportPath) || ".json";
  const basePath = reportPath.endsWith(extension)
    ? reportPath.slice(0, -extension.length)
    : reportPath;
  const label = slugify(target.projectId ?? target.projectTitle ?? `project-${index + 1}`);

  return `${basePath}-${String(index + 1).padStart(2, "0")}-${label}${extension}`;
}

function getCompanionReportPath(targetReportPath, suffix) {
  const extension = extname(targetReportPath) || ".json";
  const basePath = targetReportPath.endsWith(extension)
    ? targetReportPath.slice(0, -extension.length)
    : targetReportPath;

  return `${basePath}-${suffix}${extension}`;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function prepareIsolatedStore() {
  if (!fileStoreDir) {
    return;
  }

  const sourceProjects = join(sourceDataDir, "projects.json");
  if (!(await pathExists(sourceProjects))) {
    throw new Error(`AI benchmark source project store was not found: ${sourceProjects}`);
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
    "http://127.0.0.1:3222",
    baseUrl,
  ];

  for (const probeUrl of [...new Set(probeUrls)]) {
    try {
      const response = await fetch(probeUrl, {
        signal: AbortSignal.timeout(1500),
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
  if (!isolated) {
    return undefined;
  }

  return createNextDevServerController({
    baseUrl,
    cwd: process.cwd(),
    env: {
      ...process.env,
      EXPO_PUBLIC_API_BASE_URL: `${baseUrl}/api`,
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_API_BASE_URL: `${baseUrl}/api`,
      PHOTO_BOOK_FILE_STORE_DIR: fileStoreDir,
    },
    label: "AI benchmark server",
    port,
  });
}

async function waitForServer() {
  if (!isolated) {
    return;
  }

  await server.start();
}

async function stopServer() {
  if (!server) {
    return;
  }

  await server.stop();
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

async function readJsonReport(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function getDuplicatePairCount(duplicatePairs) {
  return Array.isArray(duplicatePairs) ? duplicatePairs.length : null;
}

function getDuplicateRate(duplicateCount, denominator) {
  if (duplicateCount === null || !denominator) {
    return null;
  }

  return duplicateCount / denominator;
}

function summarizeGenerationReport(generationReport) {
  const acceptance = generationReport.acceptance ?? {};
  const qualityReport = generationReport.qualityReport ?? {};
  const approvedPhotoCount =
    qualityReport.approvedPhotoCount ?? generationReport.approvedPhotoCount ?? null;
  const duplicatePairCount = getDuplicatePairCount(acceptance.duplicatePairs);
  const duplicateDraftPhotoCount = Array.isArray(qualityReport.duplicatePhotoIds)
    ? qualityReport.duplicatePhotoIds.length
    : null;
  const unsupportedTemplateCount = Array.isArray(acceptance.unsupportedTemplates)
    ? acceptance.unsupportedTemplates.length
    : Array.isArray(qualityReport.unsupportedTemplateIds)
      ? qualityReport.unsupportedTemplateIds.length
      : null;
  const acceptanceFailures = acceptance.failures ?? [];
  const validationWarnings = generationReport.validationWarnings ?? [];

  return {
    acceptance: {
      duplicatePairCount,
      duplicateRate: getDuplicateRate(duplicatePairCount, approvedPhotoCount),
      failures: acceptanceFailures,
      hasDetailGrid: acceptance.hasDetailGrid ?? null,
      hasHero: acceptance.hasHero ?? null,
      hasQuietCaption: acceptance.hasQuietCaption ?? null,
      hasTripContext: acceptance.hasTripContext ?? null,
      pageCount: acceptance.pageCount ?? qualityReport.pageCount ?? null,
      tripContextTerms: acceptance.tripContextTerms ?? [],
      unsupportedTemplateCount,
      unsupportedTemplates: acceptance.unsupportedTemplates ?? [],
      usedPhotoCount: acceptance.usedPhotoCount ?? qualityReport.usedPhotoCount ?? null,
      usedPhotoPercent: acceptance.usagePercent ?? qualityReport.usedPhotoPercent ?? null,
    },
    acceptanceFailures: acceptanceFailures.length,
    approxPromptPressureTokens: generationReport.approxPromptPressureTokens ?? null,
    captionQuality: {
      hasPlaceholderCopy: qualityReport.hasPlaceholderCopy ?? null,
      hasTripContext: qualityReport.hasTripContext ?? acceptance.hasTripContext ?? null,
      warnings: qualityReport.warnings ?? [],
    },
    duplicateRate: getDuplicateRate(duplicatePairCount, approvedPhotoCount),
    deterministicFallbackUsed: generationReport.deterministicFallbackUsed ?? null,
    elapsedMs: generationReport.elapsedMs ?? null,
    fallbackUsed: generationReport.fallbackUsed ?? null,
    localPlannerJsonAccepted: generationReport.localPlannerJsonAccepted ?? null,
    modelNames: generationReport.modelNames ?? null,
    plannerMode: generationReport.plannerMode ?? null,
    plannerProgress: {
      candidateProgress: generationReport.plannerCandidateProgress ?? null,
      photoSelectionProgress: generationReport.plannerPhotoSelectionProgress ?? null,
      unknownPhotoProgress: generationReport.plannerUnknownPhotoProgress ?? null,
    },
    qualityGate: {
      duplicateDraftPhotoCount,
      failures: acceptanceFailures,
      passed: acceptanceFailures.length === 0 && generationReport.runStatus === "saved",
      score: qualityReport.score ?? null,
      unsupportedTemplateCount,
      warnings: [...(qualityReport.warnings ?? []), ...validationWarnings],
    },
    qualityScore: qualityReport.score ?? null,
    runStatus: generationReport.runStatus ?? null,
    unsupportedTemplateCount,
    usedPhotoPercent: acceptance.usagePercent ?? qualityReport.usedPhotoPercent ?? null,
    validationWarnings,
  };
}

function summarizeProofReport(proofReport) {
  const assessment = proofReport.assessment ?? {};
  const imageCheck = proofReport.imageCheck ?? {};
  const failures = assessment.failures ?? [];
  const imageFailures = imageCheck.failures ?? [];
  const duplicateUsedPhotoCount = Array.isArray(assessment.duplicateUsedPhotoIds)
    ? assessment.duplicateUsedPhotoIds.length
    : null;
  const unsupportedTemplateCount = Array.isArray(assessment.unsupportedTemplateIds)
    ? assessment.unsupportedTemplateIds.length
    : null;

  return {
    captionPositionCounts: assessment.captionPositionCounts ?? {},
    failures: failures.length,
    failuresDetail: failures,
    imageFailures: imageFailures.length,
    imageFailuresDetail: imageFailures,
    layoutCount: assessment.layoutCount ?? null,
    pageCount: assessment.pageCount ?? null,
    passed: failures.length === 0 && imageFailures.length === 0,
    proofRevision: proofReport.proofRevision ?? null,
    renderedPhotoCount: assessment.renderedPhotoCount ?? null,
    unsupportedTemplateCount,
    usedPhotoCount: assessment.usedPhotoCount ?? null,
    usedPhotoDuplicateCount: duplicateUsedPhotoCount,
    usedPhotoPercent: assessment.usedPhotoPercent ?? null,
    warnings: (assessment.warnings ?? []).length,
    warningsDetail: assessment.warnings ?? [],
  };
}

try {
  const existingLocalServer = isolated ? await detectExistingLocalServer() : null;
  if (existingLocalServer) {
    throw new Error(
      [
        `A Photo Book Maker dev server is already running at ${existingLocalServer}.`,
        "The isolated AI benchmark boots its own Next server and temp project store, but Next cannot run two dev servers for the same app directory.",
        "Stop the existing dev server and rerun, or set AI_BENCHMARK_ISOLATED=0 when you intentionally want to target the running app.",
      ].join(" "),
    );
  }

  await prepareIsolatedStore();
  server = startServer();
  await waitForServer();

  await runNode("local-ai-health.mjs", {
    LOCAL_AI_HEALTH_BASE_URL: baseUrl,
    LOCAL_AI_HEALTH_REQUIRE_SAVED_RUN:
      process.env.LOCAL_AI_HEALTH_REQUIRE_SAVED_RUN ?? "0",
  });
  const targets = getBenchmarkTargets();
  const reports = [];

  for (const [index, target] of targets.entries()) {
    const targetReportPath = getTargetReportPath(target, index, targets.length);
    const smokeEnv = {
      AI_GENERATION_ALLOW_EXISTING_STORE: isolated
        ? "1"
        : process.env.AI_GENERATION_ALLOW_EXISTING_STORE,
      AI_GENERATION_BASE_URL: baseUrl,
      AI_GENERATION_REPORT_PATH: targetReportPath,
    };
    if (target.projectId) {
      smokeEnv.AI_GENERATION_PROJECT_ID = target.projectId;
    }
    if (target.projectTitle) {
      smokeEnv.AI_GENERATION_PROJECT_TITLE = target.projectTitle;
    }

    await runNode("ai-generation-smoke.mjs", smokeEnv);
    const proofReportPath = getCompanionReportPath(targetReportPath, "proof-quality");
    const proofEnv = {
      PROOF_QUALITY_BASE_URL: baseUrl,
      PROOF_QUALITY_REPORT_PATH: proofReportPath,
    };
    if (target.projectId) {
      proofEnv.PROOF_QUALITY_PROJECT_ID = target.projectId;
    }
    if (target.projectTitle) {
      proofEnv.PROOF_QUALITY_PROJECT_TITLE = target.projectTitle;
    }
    if (process.env.AI_GENERATION_CONTEXT_TERMS && !process.env.PROOF_QUALITY_CONTEXT_TERMS) {
      proofEnv.PROOF_QUALITY_CONTEXT_TERMS = process.env.AI_GENERATION_CONTEXT_TERMS;
    }

    await runNode("proof-quality-smoke.mjs", proofEnv);
    const generationReport = await readJsonReport(targetReportPath);
    const proofReport = await readJsonReport(proofReportPath);
    const generationSummary = summarizeGenerationReport(generationReport);
    const proofSummary = summarizeProofReport(proofReport);
    reports.push({
      generation: generationSummary,
      projectId: target.projectId ?? null,
      projectTitle: target.projectTitle ?? null,
      proof: proofSummary,
      qualityGate: {
        failures: [
          ...generationSummary.qualityGate.failures,
          ...proofSummary.failuresDetail.map((failure) => `proof failure: ${failure}`),
          ...proofSummary.imageFailuresDetail.map((failure) => `proof image failure: ${failure}`),
        ],
        passed: generationSummary.qualityGate.passed && proofSummary.passed,
        warnings: [
          ...generationSummary.qualityGate.warnings,
          ...proofSummary.warningsDetail.map((warning) => `proof warning: ${warning}`),
        ],
      },
      proofReportPath,
      reportPath: targetReportPath,
    });
  }

  console.log(
    JSON.stringify(
      {
        isolated,
        reportPath: targets.length === 1 ? reports[0]?.reportPath ?? reportPath : null,
        reports,
        sourceDataDir: isolated ? sourceDataDir : null,
        status: "local AI benchmark passed",
        tempStoreDir: isolated ? fileStoreDir : null,
      },
      null,
      2,
    ),
  );
} finally {
  await stopServer();
  if (fileStoreDir) {
    await rm(fileStoreDir, { force: true, recursive: true });
  }
}
