/* global AbortSignal, URL, clearInterval, console, fetch, process, setInterval, setTimeout */
import { Buffer } from "node:buffer";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { makeSharedSecretStrengthCheck } from "../src/lib/alpha-readiness-contract.js";

function parseWorkerIntegerEnv(name, fallback, min = 0) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);

  if (!Number.isFinite(parsed)) {
    return Math.max(min, fallback);
  }

  return Math.max(min, parsed);
}

const hostedBaseUrl = (
  process.env.LOCAL_AI_WORKER_HOSTED_BASE_URL ??
  process.env.LOCAL_AI_WORKER_BASE_URL ??
  "http://127.0.0.1:3000"
).replace(/\/$/, "");
const processorBaseUrl = (
  process.env.LOCAL_AI_WORKER_PROCESSOR_BASE_URL ??
  process.env.LOCAL_AI_WORKER_BASE_URL ??
  hostedBaseUrl
).replace(/\/$/, "");
const workerSecretConfig = getWorkerSecretConfig();
const secret = workerSecretConfig.value;
const workerId =
  process.env.LOCAL_AI_WORKER_ID ??
  `local-worker-${process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? "pc"}`;
const pollMs = parseWorkerIntegerEnv("LOCAL_AI_WORKER_POLL_MS", 15000, 250);
const heartbeatMs = Math.max(
  10000,
  parseWorkerIntegerEnv("LOCAL_AI_WORKER_HEARTBEAT_MS", 60000, 10000),
);
const requestTimeoutMs = Math.max(
  5000,
  parseWorkerIntegerEnv("LOCAL_AI_WORKER_REQUEST_TIMEOUT_MS", 30000, 5000),
);
const processorTimeoutMs = Math.max(
  requestTimeoutMs,
  parseWorkerIntegerEnv("LOCAL_AI_WORKER_PROCESS_TIMEOUT_MS", 3600000, requestTimeoutMs),
);
const backoffMaxMs = Math.max(
  pollMs,
  parseWorkerIntegerEnv("LOCAL_AI_WORKER_BACKOFF_MAX_MS", 120000, pollMs),
);
const backoffJitterMs = parseWorkerIntegerEnv("LOCAL_AI_WORKER_BACKOFF_JITTER_MS", 1000, 0);
const maxConsecutiveFailures = parseWorkerIntegerEnv(
  "LOCAL_AI_WORKER_MAX_CONSECUTIVE_FAILURES",
  0,
  0,
);
const loop = process.env.LOCAL_AI_WORKER_LOOP === "1";
const preflightOnly = process.env.LOCAL_AI_WORKER_PREFLIGHT_ONLY === "1";
const skipProcessorHealth = process.env.LOCAL_AI_WORKER_SKIP_PROCESSOR_HEALTH === "1";
const verifyHostedAuth = process.env.LOCAL_AI_WORKER_VERIFY_HOSTED_AUTH === "1";

if (!secret) {
  throw new Error("LOCAL_AI_WORKER_SECRET or AI_WORKER_SECRET is required.");
}

function getWorkerSecretConfig() {
  const localSecret = process.env.LOCAL_AI_WORKER_SECRET;
  if (localSecret?.trim()) {
    return {
      value: localSecret,
      variable: "LOCAL_AI_WORKER_SECRET",
    };
  }

  const legacySecret = process.env.AI_WORKER_SECRET;
  if (legacySecret?.trim()) {
    return {
      value: legacySecret,
      variable: "AI_WORKER_SECRET",
    };
  }

  return {
    value: "",
    variable: "LOCAL_AI_WORKER_SECRET",
  };
}

const workerSecretCheck = makeSharedSecretStrengthCheck({
  label: "Private AI worker secret",
  name: "private AI worker secret strength",
  required: true,
  value: secret,
  variable: workerSecretConfig.variable,
});

if (workerSecretCheck.status === "fail") {
  throw new Error(workerSecretCheck.detail);
}

function isLoopbackUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function isPrivateProcessorUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (isLoopbackUrl(value) || host.endsWith(".local")) {
      return true;
    }

    const parts = host.split(".").map((part) => Number.parseInt(part, 10));
    if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
      return false;
    }

    const [first, second] = parts;
    return (
      first === 10 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  } catch {
    return false;
  }
}

function getLoopRetryDelayMs(consecutiveFailures) {
  const exponent = Math.min(Math.max(0, consecutiveFailures - 1), 8);
  const baseDelayMs = pollMs * 2 ** exponent;
  const jitterMs =
    backoffJitterMs > 0 ? Math.floor(Math.random() * (backoffJitterMs + 1)) : 0;

  return Math.min(backoffMaxMs, baseDelayMs + jitterMs);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (!isPrivateProcessorUrl(processorBaseUrl) && process.env.LOCAL_AI_WORKER_ALLOW_HOSTED_PROCESSOR !== "1") {
  throw new Error(
    "LOCAL_AI_WORKER_PROCESSOR_BASE_URL must point to a loopback, LAN, or .local private processor unless LOCAL_AI_WORKER_ALLOW_HOSTED_PROCESSOR=1 is set intentionally.",
  );
}

async function apiJson(baseUrl, path, init = {}, timeoutMs = requestTimeoutMs) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status} ${JSON.stringify(body).slice(0, 1000)}`);
  }

  return body;
}

async function assertProcessorHealth() {
  if (skipProcessorHealth) {
    console.log("Skipping local processor health check by request.");
    return;
  }

  const body = await apiJson(processorBaseUrl, "/api/ai/local/health");
  const missingModels = body.ai?.missingModels ?? [];

  if (!body.ai?.ollamaReachable) {
    throw new Error("Local AI processor preflight failed: Ollama is not reachable.");
  }

  if (missingModels.length) {
    throw new Error(
      `Local AI processor preflight failed: missing model(s): ${missingModels.join(", ")}.`,
    );
  }

  console.log(
    JSON.stringify(
      {
        localAiStatus: body.ai?.status,
        missingModels,
        ollamaReachable: Boolean(body.ai?.ollamaReachable),
        processorBaseUrl,
      },
      null,
      2,
    ),
  );
}

async function assertHostedWorkerAuth() {
  if (!verifyHostedAuth) {
    return;
  }

  const body = await apiJson(hostedBaseUrl, "/api/ai/worker/health");
  if (body.status !== "ready" || !body.queue?.enabled) {
    throw new Error("Hosted AI worker handshake succeeded, but the queue is not ready.");
  }

  console.log(
    JSON.stringify(
      {
        hostedBaseUrl,
        hostedWorkerAuth: "verified",
        queueEnabled: true,
      },
      null,
      2,
    ),
  );
}

async function preflightWorker() {
  await assertProcessorHealth();
  await assertHostedWorkerAuth();
  if (preflightOnly) {
    console.log("Local AI worker preflight passed.");
  }
}

async function claimJob() {
  return apiJson(hostedBaseUrl, "/api/ai/worker/generation/claim", {
    method: "POST",
    body: JSON.stringify({
      workerId,
    }),
  });
}

function getJobSignaturePayload(job) {
  return JSON.stringify({
    expectedRevision: job.expectedRevision,
    projectDigest: job.projectDigest,
    projectId: job.projectId,
    runId: job.runId,
    version: 1,
    workerId: job.workerId,
    workerLeaseToken: job.workerLeaseToken,
  });
}

function hashJobProject(project) {
  return createHash("sha256").update(JSON.stringify(project)).digest("hex");
}

function signJob(job) {
  return `v1:${createHmac("sha256", secret).update(getJobSignaturePayload(job)).digest("hex")}`;
}

function assertValidJobSignature(job) {
  if (!job.jobSignature || !job.workerLeaseToken || !job.projectDigest) {
    throw new Error(
      "Claimed AI worker job is missing its signature, lease token, or project digest.",
    );
  }

  if (hashJobProject(job.project) !== job.projectDigest) {
    throw new Error("Claimed AI worker job project digest did not match.");
  }

  const expected = Buffer.from(signJob(job));
  const actual = Buffer.from(job.jobSignature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("Claimed AI worker job signature did not match.");
  }
}

async function failJob(job, error) {
  await apiJson(hostedBaseUrl, "/api/ai/worker/generation/fail", {
    method: "POST",
    body: JSON.stringify({
      errorMessage: error instanceof Error ? error.message : "Local AI worker failed.",
      projectId: job.projectId,
      runId: job.runId,
      workerId,
      workerLeaseToken: job.workerLeaseToken,
    }),
  }).catch((failError) => {
    console.error(`Failed to mark job failed: ${failError.message}`);
  });
}

async function heartbeatJob(job) {
  await apiJson(hostedBaseUrl, "/api/ai/worker/generation/heartbeat", {
    method: "POST",
    body: JSON.stringify({
      projectId: job.projectId,
      runId: job.runId,
      workerId,
      workerLeaseToken: job.workerLeaseToken,
    }),
  });
}

async function processJob(job) {
  console.log(`Claimed generation job ${job.runId} for ${job.project.title}.`);
  await heartbeatJob(job);
  const heartbeatTimer = setInterval(() => {
    heartbeatJob(job).catch((error) => {
      console.error(`AI worker heartbeat failed: ${error.message}`);
    });
  }, heartbeatMs);

  let processed;
  try {
    processed = await apiJson(processorBaseUrl, "/api/ai/worker/generation/process", {
      method: "POST",
      body: JSON.stringify({
        expectedRevision: job.expectedRevision,
        jobSignature: job.jobSignature,
        project: job.project,
        projectDigest: job.projectDigest,
        runId: job.runId,
        workerId,
        workerLeaseToken: job.workerLeaseToken,
      }),
    }, processorTimeoutMs);
  } finally {
    clearInterval(heartbeatTimer);
  }

  const completed = await apiJson(hostedBaseUrl, "/api/ai/worker/generation/complete", {
    method: "POST",
    body: JSON.stringify({
      expectedRevision: job.expectedRevision,
      project: processed.project,
      projectId: job.projectId,
      runId: job.runId,
      workerId,
      workerLeaseToken: job.workerLeaseToken,
    }),
  });

  console.log(
    JSON.stringify(
      {
        projectId: completed.project?.id,
        qualityScore: completed.run?.qualityReport?.score ?? null,
        runId: completed.run?.id,
        status: completed.run?.status,
      },
      null,
      2,
    ),
  );
}

async function runOnce() {
  const claim = await claimJob();
  if (!claim.job) {
    console.log("No queued local AI generation jobs.");
    return;
  }

  assertValidJobSignature(claim.job);
  try {
    await processJob(claim.job);
  } catch (error) {
    await failJob(claim.job, error);
    throw error;
  }
}

let consecutiveFailures = 0;

do {
  try {
    await preflightWorker();
    if (!preflightOnly) {
      await runOnce();
    }
    consecutiveFailures = 0;
    if (loop) {
      await sleep(pollMs);
    }
  } catch (error) {
    if (!loop || preflightOnly) {
      throw error;
    }

    consecutiveFailures += 1;
    const retryDelayMs = getLoopRetryDelayMs(consecutiveFailures);
    console.error(
      `AI worker loop error ${consecutiveFailures}; retrying in ${retryDelayMs}ms: ${
        error instanceof Error ? error.message : "Unknown worker error."
      }`,
    );
    if (
      maxConsecutiveFailures > 0 &&
      consecutiveFailures >= maxConsecutiveFailures
    ) {
      throw error;
    }

    await sleep(retryDelayMs);
  }
} while (loop && !preflightOnly);
