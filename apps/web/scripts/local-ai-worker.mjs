/* global AbortSignal, URL, clearInterval, console, fetch, process, setInterval, setTimeout */

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
const secret = process.env.LOCAL_AI_WORKER_SECRET ?? process.env.AI_WORKER_SECRET;
const workerId =
  process.env.LOCAL_AI_WORKER_ID ??
  `local-worker-${process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? "pc"}`;
const pollMs = Number.parseInt(process.env.LOCAL_AI_WORKER_POLL_MS ?? "15000", 10);
const heartbeatMs = Math.max(
  10000,
  Number.parseInt(process.env.LOCAL_AI_WORKER_HEARTBEAT_MS ?? "60000", 10),
);
const requestTimeoutMs = Math.max(
  5000,
  Number.parseInt(process.env.LOCAL_AI_WORKER_REQUEST_TIMEOUT_MS ?? "30000", 10),
);
const processorTimeoutMs = Math.max(
  requestTimeoutMs,
  Number.parseInt(process.env.LOCAL_AI_WORKER_PROCESS_TIMEOUT_MS ?? "3600000", 10),
);
const loop = process.env.LOCAL_AI_WORKER_LOOP === "1";
const preflightOnly = process.env.LOCAL_AI_WORKER_PREFLIGHT_ONLY === "1";
const skipProcessorHealth = process.env.LOCAL_AI_WORKER_SKIP_PROCESSOR_HEALTH === "1";

if (!secret) {
  throw new Error("LOCAL_AI_WORKER_SECRET or AI_WORKER_SECRET is required.");
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

async function preflightWorker() {
  await assertProcessorHealth();
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

async function failJob(job, error) {
  await apiJson(hostedBaseUrl, "/api/ai/worker/generation/fail", {
    method: "POST",
    body: JSON.stringify({
      errorMessage: error instanceof Error ? error.message : "Local AI worker failed.",
      projectId: job.projectId,
      runId: job.runId,
      workerId,
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
        project: job.project,
        runId: job.runId,
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

  try {
    await processJob(claim.job);
  } catch (error) {
    await failJob(claim.job, error);
    throw error;
  }
}

do {
  await preflightWorker();
  if (!preflightOnly) {
    await runOnce();
  }
  if (loop) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
} while (loop && !preflightOnly);
