/* global console, process */

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeSharedSecretStrengthCheck } from "../src/lib/alpha-readiness-contract.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const reportPath =
  process.env.HOSTED_ALPHA_ACCEPTANCE_REPORT_PATH ??
  join(tmpdir(), `photo-book-hosted-alpha-acceptance-${Date.now()}.json`);
const hostedAlphaReportPath =
  process.env.HOSTED_ALPHA_ACCEPTANCE_HOSTED_REPORT_PATH ??
  getCompanionReportPath(reportPath, "hosted-alpha");
const baseUrl = (
  process.env.HOSTED_ALPHA_BASE_URL ??
  process.env.ALPHA_READINESS_BASE_URL ??
  ""
).replace(/\/$/, "");
const readinessSecret =
  process.env.ALPHA_READINESS_SECRET ?? process.env.TRIGGER_SECRET_KEY ?? "";
const workerSecretConfig = getWorkerSecretConfig();
const dryRun = process.env.HOSTED_ALPHA_ACCEPTANCE_DRY_RUN === "1";
const skipContract = process.env.HOSTED_ALPHA_ACCEPTANCE_SKIP_CONTRACT === "1";
const skipWorkerPreflight =
  process.env.HOSTED_ALPHA_ACCEPTANCE_SKIP_WORKER_PREFLIGHT === "1";

function getCompanionReportPath(targetReportPath, suffix) {
  const extension = extname(targetReportPath) || ".json";
  const basePath = targetReportPath.endsWith(extension)
    ? targetReportPath.slice(0, -extension.length)
    : targetReportPath;

  return `${basePath}-${suffix}${extension}`;
}

function getWorkerSecretConfig() {
  if (process.env.LOCAL_AI_WORKER_SECRET?.trim()) {
    return {
      value: process.env.LOCAL_AI_WORKER_SECRET,
      variable: "LOCAL_AI_WORKER_SECRET",
    };
  }

  if (process.env.AI_WORKER_SECRET?.trim()) {
    return {
      value: process.env.AI_WORKER_SECRET,
      variable: "AI_WORKER_SECRET",
    };
  }

  return {
    value: "",
    variable: "LOCAL_AI_WORKER_SECRET",
  };
}

function getReadinessSecretVariable() {
  if (process.env.ALPHA_READINESS_SECRET?.trim()) {
    return "ALPHA_READINESS_SECRET";
  }
  if (process.env.TRIGGER_SECRET_KEY?.trim()) {
    return "TRIGGER_SECRET_KEY";
  }

  return "ALPHA_READINESS_SECRET";
}

function getProcessorBaseUrl() {
  return (
    process.env.LOCAL_AI_WORKER_PROCESSOR_BASE_URL ??
    process.env.LOCAL_AI_WORKER_BASE_URL ??
    ""
  ).replace(/\/$/, "");
}

function getPublicConfigSummary() {
  return {
    baseUrl: baseUrl || null,
    dryRun,
    hostedAlphaReportPath,
    proofBearerTokenConfigured: Boolean(
      process.env.HOSTED_ALPHA_PROOF_BEARER_TOKEN ??
        process.env.PROOF_QUALITY_BEARER_TOKEN,
    ),
    proofProjectConfigured: Boolean(
      process.env.HOSTED_ALPHA_PROOF_PROJECT_ID ??
        process.env.PROOF_QUALITY_PROJECT_ID ??
        process.env.HOSTED_ALPHA_PROOF_PROJECT_TITLE ??
        process.env.PROOF_QUALITY_PROJECT_TITLE,
    ),
    reportPath,
    skipContract,
    skipWorkerPreflight,
    workerProcessorBaseUrl: getProcessorBaseUrl() || null,
    workerSecretConfigured: Boolean(workerSecretConfig.value?.trim()),
  };
}

function assertStrongSharedSecret({ label, name, value, variable }) {
  const check = makeSharedSecretStrengthCheck({
    label,
    name,
    required: true,
    value,
    variable,
  });

  if (check.status === "fail") {
    throw new Error(check.detail);
  }
}

function assertConfigured() {
  const missing = [];

  if (!baseUrl) {
    missing.push("HOSTED_ALPHA_BASE_URL or ALPHA_READINESS_BASE_URL");
  }
  if (!readinessSecret) {
    missing.push("ALPHA_READINESS_SECRET or TRIGGER_SECRET_KEY");
  }
  if (!skipWorkerPreflight && !workerSecretConfig.value) {
    missing.push("LOCAL_AI_WORKER_SECRET or AI_WORKER_SECRET");
  }
  if (!skipWorkerPreflight && !getProcessorBaseUrl()) {
    missing.push("LOCAL_AI_WORKER_PROCESSOR_BASE_URL");
  }

  if (missing.length) {
    throw new Error(`Hosted alpha acceptance is missing: ${missing.join(", ")}`);
  }

  assertStrongSharedSecret({
    label: "Alpha readiness secret",
    name: "alpha readiness secret strength",
    value: readinessSecret,
    variable: getReadinessSecretVariable(),
  });

  if (!skipWorkerPreflight) {
    assertStrongSharedSecret({
      label: "Private AI worker secret",
      name: "private AI worker secret strength",
      value: workerSecretConfig.value,
      variable: workerSecretConfig.variable,
    });
  }
}

async function writeReport(summary) {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

async function readJsonReport(path) {
  return JSON.parse(await readFile(path, "utf8"));
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

    child.on("error", reject);
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

function getHostedAlphaDigest(report) {
  return {
    baseUrl: report.baseUrl ?? baseUrl,
    mode: report.mode ?? "hosted",
    proof: report.proof ?? null,
    readiness: report.readiness ?? null,
    reportPath: hostedAlphaReportPath,
    requireProof: report.requireProof ?? null,
    status: report.status ?? null,
  };
}

async function main() {
  const results = [];
  let failedStep = null;
  let hostedAlphaReport = null;

  try {
    assertConfigured();

    const steps = [];
    if (!skipContract) {
      steps.push(["readiness contract", "readiness-contract-smoke.mjs"]);
    }

    steps.push([
      dryRun ? "hosted alpha smoke dry run" : "hosted alpha smoke",
      "hosted-alpha-smoke.mjs",
      {
        ALPHA_READINESS_BASE_URL: baseUrl,
        ALPHA_READINESS_SECRET: readinessSecret,
        HOSTED_ALPHA_BASE_URL: baseUrl,
        HOSTED_ALPHA_DRY_RUN: dryRun ? "1" : process.env.HOSTED_ALPHA_DRY_RUN,
        HOSTED_ALPHA_REPORT_PATH: hostedAlphaReportPath,
      },
    ]);

    if (!skipWorkerPreflight && !dryRun) {
      steps.push([
        "private worker preflight",
        "local-ai-worker.mjs",
        {
          LOCAL_AI_WORKER_HOSTED_BASE_URL:
            process.env.LOCAL_AI_WORKER_HOSTED_BASE_URL ?? baseUrl,
          LOCAL_AI_WORKER_PREFLIGHT_ONLY: "1",
          LOCAL_AI_WORKER_VERIFY_HOSTED_AUTH: "1",
        },
      ]);
    }

    for (const [step, scriptName, env] of steps) {
      console.log(`\n== ${step} ==`);
      results.push(await runNodeStep(step, scriptName, env));
    }

    hostedAlphaReport = await readJsonReport(hostedAlphaReportPath);
  } catch (error) {
    if (error?.stepResult) {
      failedStep = error.stepResult;
      results.push(failedStep);
    }

    const summary = {
      config: getPublicConfigSummary(),
      failedStep,
      hostedAlpha: hostedAlphaReport ? getHostedAlphaDigest(hostedAlphaReport) : null,
      reportPath,
      results,
      status: "failed",
    };
    await writeReport(summary);
    console.log(JSON.stringify(summary, null, 2));
    throw error;
  }

  const summary = {
    config: getPublicConfigSummary(),
    failedStep: null,
    hostedAlpha: getHostedAlphaDigest(hostedAlphaReport),
    reportPath,
    results,
    status: dryRun
      ? "hosted alpha acceptance dry run passed"
      : "hosted alpha acceptance passed",
  };
  await writeReport(summary);
  console.log(JSON.stringify(summary, null, 2));
}

await main();
