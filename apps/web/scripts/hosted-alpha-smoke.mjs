/* global URL, console, process */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const reportPath =
  process.env.HOSTED_ALPHA_REPORT_PATH ??
  join(tmpdir(), `photo-book-hosted-alpha-smoke-${Date.now()}.json`);
const baseUrl = (
  process.env.HOSTED_ALPHA_BASE_URL ??
  process.env.ALPHA_READINESS_BASE_URL ??
  ""
).replace(/\/$/, "");
const readinessSecret =
  process.env.ALPHA_READINESS_SECRET ?? process.env.TRIGGER_SECRET_KEY ?? "";
const requireProof = process.env.HOSTED_ALPHA_REQUIRE_PROOF !== "0";
const dryRun = process.env.HOSTED_ALPHA_DRY_RUN === "1";
const proofBearerToken =
  process.env.HOSTED_ALPHA_PROOF_BEARER_TOKEN ??
  process.env.PROOF_QUALITY_BEARER_TOKEN ??
  "";
const proofProjectId =
  process.env.HOSTED_ALPHA_PROOF_PROJECT_ID ?? process.env.PROOF_QUALITY_PROJECT_ID;
const proofProjectTitle =
  process.env.HOSTED_ALPHA_PROOF_PROJECT_TITLE ?? process.env.PROOF_QUALITY_PROJECT_TITLE;

function getCompanionReportPath(suffix) {
  const extension = extname(reportPath) || ".json";
  const basePath = reportPath.endsWith(extension)
    ? reportPath.slice(0, -extension.length)
    : reportPath;

  return `${basePath}-${suffix}${extension}`;
}

function isLoopbackBaseUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function assertConfigured() {
  const missing = [];

  if (!baseUrl) {
    missing.push("HOSTED_ALPHA_BASE_URL or ALPHA_READINESS_BASE_URL");
  }
  if (!readinessSecret) {
    missing.push("ALPHA_READINESS_SECRET");
  }
  if (requireProof && !proofBearerToken) {
    missing.push("HOSTED_ALPHA_PROOF_BEARER_TOKEN or PROOF_QUALITY_BEARER_TOKEN");
  }
  if (requireProof && !proofProjectId && !proofProjectTitle) {
    missing.push("HOSTED_ALPHA_PROOF_PROJECT_ID or HOSTED_ALPHA_PROOF_PROJECT_TITLE");
  }

  if (missing.length) {
    throw new Error(`Hosted alpha smoke is missing: ${missing.join(", ")}`);
  }

  if (isLoopbackBaseUrl(baseUrl) && process.env.HOSTED_ALPHA_ALLOW_LOCAL_BASE_URL !== "1") {
    throw new Error(
      "Hosted alpha smoke requires a hosted URL. Set HOSTED_ALPHA_ALLOW_LOCAL_BASE_URL=1 only for local script checks.",
    );
  }
}

async function readJsonReport(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeReport(summary) {
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

assertConfigured();

if (dryRun) {
  const summary = {
    baseUrl,
    mode: "hosted",
    proofBearerTokenConfigured: Boolean(proofBearerToken),
    proofProjectId: proofProjectId ?? null,
    proofProjectTitle: proofProjectTitle ?? null,
    reportPath,
    requireProof,
    status: "hosted alpha smoke dry run passed",
  };
  console.log(JSON.stringify(summary, null, 2));
  await writeReport(summary);
  process.exit(0);
}

const readinessReportPath = getCompanionReportPath("readiness");
const proofReportPath = getCompanionReportPath("proof-quality");

await runNode("alpha-readiness.mjs", {
  ALPHA_READINESS_BASE_URL: baseUrl,
  ALPHA_READINESS_MODE: "hosted",
  ALPHA_READINESS_REPORT_PATH: readinessReportPath,
  ALPHA_READINESS_REQUIRE_SERVER: "1",
  ALPHA_READINESS_SECRET: readinessSecret,
});

const readinessReport = await readJsonReport(readinessReportPath);
let proofReport = null;

if (requireProof) {
  const proofEnv = {
    PROOF_QUALITY_BASE_URL: baseUrl,
    PROOF_QUALITY_BEARER_TOKEN: proofBearerToken,
    PROOF_QUALITY_REPORT_PATH: proofReportPath,
  };

  if (proofProjectId) {
    proofEnv.PROOF_QUALITY_PROJECT_ID = proofProjectId;
  }
  if (proofProjectTitle) {
    proofEnv.PROOF_QUALITY_PROJECT_TITLE = proofProjectTitle;
  }

  await runNode("proof-quality-smoke.mjs", proofEnv);
  proofReport = await readJsonReport(proofReportPath);
} else {
  console.log("Hosted proof-quality gate skipped by HOSTED_ALPHA_REQUIRE_PROOF=0.");
}

const summary = {
  baseUrl,
  mode: "hosted",
  proof: proofReport
    ? {
        failures: proofReport.assessment?.failures?.length ?? null,
        imageFailures: proofReport.imageCheck?.failures?.length ?? null,
        pageCount: proofReport.assessment?.pageCount ?? null,
        projectId: proofReport.projectId ?? null,
        projectTitle: proofReport.projectTitle ?? null,
        proofRevision: proofReport.proofRevision ?? null,
        reportPath: proofReportPath,
        usedPhotoPercent: proofReport.assessment?.usedPhotoPercent ?? null,
        warnings: proofReport.assessment?.warnings?.length ?? null,
      }
    : null,
  readiness: {
    reportPath: readinessReportPath,
    status: readinessReport.status ?? null,
    totals: readinessReport.totals ?? null,
  },
  reportPath,
  requireProof,
  status: "hosted alpha smoke passed",
};

await writeReport(summary);
console.log(JSON.stringify(summary, null, 2));
console.log("hosted alpha smoke passed");
