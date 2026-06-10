/* global URL, clearInterval, console, fetch, process, setInterval, setTimeout */

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
const loop = process.env.LOCAL_AI_WORKER_LOOP === "1";

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

if (
  hostedBaseUrl === processorBaseUrl &&
  !isLoopbackUrl(processorBaseUrl) &&
  process.env.LOCAL_AI_WORKER_ALLOW_HOSTED_PROCESSOR !== "1"
) {
  throw new Error(
    "LOCAL_AI_WORKER_PROCESSOR_BASE_URL must point to the private local processor when the hosted base URL is remote.",
  );
}

async function apiJson(baseUrl, path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status} ${JSON.stringify(body).slice(0, 1000)}`);
  }

  return body;
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
    });
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
  await runOnce();
  if (loop) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
} while (loop);
