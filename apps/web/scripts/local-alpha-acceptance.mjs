/* global console, process */

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareLocalAlphaFixtureStore } from "./lib/local-alpha-fixtures.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const reportPath =
  process.env.LOCAL_ALPHA_ACCEPTANCE_REPORT_PATH ??
  join(tmpdir(), `photo-book-local-alpha-acceptance-${Date.now()}.json`);
const benchmarkReportPath =
  process.env.LOCAL_ALPHA_ACCEPTANCE_BENCHMARK_REPORT_PATH ??
  getCompanionReportPath(reportPath, "benchmark");
const benchmarkSummaryReportPath =
  process.env.LOCAL_ALPHA_ACCEPTANCE_BENCHMARK_SUMMARY_REPORT_PATH ??
  getCompanionReportPath(benchmarkReportPath, "summary");
const skipBenchmark = process.env.LOCAL_ALPHA_ACCEPTANCE_SKIP_BENCHMARK === "1";

function getCompanionReportPath(targetReportPath, suffix) {
  const extension = extname(targetReportPath) || ".json";
  const basePath = targetReportPath.endsWith(extension)
    ? targetReportPath.slice(0, -extension.length)
    : targetReportPath;

  return `${basePath}-${suffix}${extension}`;
}

function getBenchmarkDigest(summary) {
  return {
    reportCount: summary.reports?.length ?? 0,
    reports:
      summary.reports?.map((report) => ({
        deterministicFallbackUsed: report.generation?.deterministicFallbackUsed ?? null,
        generationPassed: report.generation?.qualityGate?.passed ?? null,
        plannerMode: report.generation?.plannerMode ?? null,
        proofPassed: report.proof?.passed ?? null,
        projectId: report.projectId,
        projectTitle: report.projectTitle,
        qualityGatePassed: report.qualityGate?.passed ?? null,
        qualityScore: report.generation?.qualityScore ?? null,
        usedPhotoPercent: report.generation?.usedPhotoPercent ?? null,
      })) ?? [],
    status: summary.status ?? null,
    summaryReportPath: benchmarkSummaryReportPath,
  };
}

async function writeReport(summary) {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

function runNodeStep(step, scriptName, env = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [join(scriptDir, scriptName)], {
      env: {
        ...process.env,
        ...env,
      },
      stdio: "inherit",
    });

    child.on("error", (error) => {
      reject(error);
    });
    child.on("exit", (code) => {
      const elapsedMs = Date.now() - startedAt;
      if (code === 0) {
        resolve({
          elapsedMs,
          scriptName,
          step,
          status: "passed",
        });
        return;
      }

      const error = new Error(`${scriptName} exited with code ${code ?? "unknown"}.`);
      error.stepResult = {
        elapsedMs,
        scriptName,
        step,
        status: "failed",
      };
      reject(error);
    });
  });
}

async function main(fixtureStoreDir) {
  const steps = [
    ["readiness contract", "readiness-contract-smoke.mjs"],
    [
      "local alpha readiness",
      "alpha-readiness.mjs",
      {
        ALPHA_READINESS_REQUIRE_SAVED_RUN: "0",
        ALPHA_READINESS_SOURCE_DATA_DIR: fixtureStoreDir,
      },
    ],
    [
      "local AI health",
      "local-ai-health.mjs",
      {
        LOCAL_AI_HEALTH_REQUIRE_SAVED_RUN: "0",
        LOCAL_AI_HEALTH_SOURCE_DATA_DIR: fixtureStoreDir,
      },
    ],
    ["local AI worker preflight", "local-ai-worker-preflight-smoke.mjs"],
  ];

  if (!skipBenchmark) {
    steps.push([
      "local AI alpha benchmark",
      "local-ai-alpha-benchmark.mjs",
      {
        AI_ALPHA_BENCHMARK_REPORT_PATH: benchmarkReportPath,
        AI_ALPHA_BENCHMARK_SOURCE_DATA_DIR: fixtureStoreDir,
        AI_ALPHA_BENCHMARK_SUMMARY_REPORT_PATH: benchmarkSummaryReportPath,
      },
    ]);
  }

  const results = [];
  let benchmarkSummary = null;
  let failedStep = null;

  try {
    for (const [step, scriptName, env] of steps) {
      console.log(`\n== ${step} ==`);
      const result = await runNodeStep(step, scriptName, env);
      results.push(result);
    }

    if (!skipBenchmark) {
      benchmarkSummary = JSON.parse(await readFile(benchmarkSummaryReportPath, "utf8"));
    }
  } catch (error) {
    if (error?.stepResult) {
      failedStep = error.stepResult;
      results.push(failedStep);
    }

    const summary = {
      benchmark: benchmarkSummary ? getBenchmarkDigest(benchmarkSummary) : null,
      benchmarkReportPath: skipBenchmark ? null : benchmarkReportPath,
      benchmarkSkipped: skipBenchmark,
      benchmarkSummaryReportPath: skipBenchmark ? null : benchmarkSummaryReportPath,
      failedStep,
      reportPath,
      results,
      status: "failed",
    };
    await writeReport(summary);
    console.log(JSON.stringify(summary, null, 2));
    throw error;
  }

  const summary = {
    benchmark: benchmarkSummary ? getBenchmarkDigest(benchmarkSummary) : null,
    benchmarkReportPath: skipBenchmark ? null : benchmarkReportPath,
    benchmarkSkipped: skipBenchmark,
    benchmarkSummaryReportPath: skipBenchmark ? null : benchmarkSummaryReportPath,
    failedStep: null,
    reportPath,
    results,
    status: "local alpha acceptance passed",
  };
  await writeReport(summary);
  console.log(JSON.stringify(summary, null, 2));
}

const fixtureStoreDir = await mkdtemp(join(tmpdir(), "photo-book-local-alpha-acceptance-"));
try {
  await prepareLocalAlphaFixtureStore(fixtureStoreDir);
  await main(fixtureStoreDir);
} finally {
  await rm(fixtureStoreDir, { force: true, recursive: true });
}
