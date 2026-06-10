/* global URL, clearTimeout, console, process, setTimeout */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const workerScriptPath = fileURLToPath(new URL("./local-ai-worker.mjs", import.meta.url));
const STRONG_WORKER_SECRET = "photo-book-worker-smoke-secret-2026-random";
const workerEnvKeys = [
  "AI_WORKER_SECRET",
  "LOCAL_AI_WORKER_ALLOW_HOSTED_PROCESSOR",
  "LOCAL_AI_WORKER_BACKOFF_JITTER_MS",
  "LOCAL_AI_WORKER_BACKOFF_MAX_MS",
  "LOCAL_AI_WORKER_BASE_URL",
  "LOCAL_AI_WORKER_HEARTBEAT_MS",
  "LOCAL_AI_WORKER_HOSTED_BASE_URL",
  "LOCAL_AI_WORKER_ID",
  "LOCAL_AI_WORKER_LOOP",
  "LOCAL_AI_WORKER_MAX_CONSECUTIVE_FAILURES",
  "LOCAL_AI_WORKER_POLL_MS",
  "LOCAL_AI_WORKER_PREFLIGHT_ONLY",
  "LOCAL_AI_WORKER_PROCESSOR_BASE_URL",
  "LOCAL_AI_WORKER_PROCESS_TIMEOUT_MS",
  "LOCAL_AI_WORKER_REQUEST_TIMEOUT_MS",
  "LOCAL_AI_WORKER_SECRET",
  "LOCAL_AI_WORKER_SKIP_PROCESSOR_HEALTH",
];

function buildWorkerEnv(overrides = {}) {
  const env = { ...process.env };
  for (const key of workerEnvKeys) {
    delete env[key];
  }

  return {
    ...env,
    ...overrides,
  };
}

function runWorkerPreflight(label, envOverrides) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerScriptPath], {
      cwd: process.cwd(),
      env: buildWorkerEnv(envOverrides),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${label} timed out.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 10_000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      resolve({
        code,
        stderr,
        stdout,
      });
    });
  });
}

function assertIncludes(text, expected, label) {
  if (!text.includes(expected)) {
    throw new Error(`${label} did not include "${expected}".\n${text}`);
  }
}

function assertExit(result, expectedCode, label) {
  if (result.code !== expectedCode) {
    throw new Error(
      `${label} exited with ${result.code}; expected ${expectedCode}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

const loopbackPreflight = await runWorkerPreflight("loopback preflight", {
  LOCAL_AI_WORKER_HOSTED_BASE_URL: "https://hosted-alpha.example",
  LOCAL_AI_WORKER_PREFLIGHT_ONLY: "1",
  LOCAL_AI_WORKER_PROCESSOR_BASE_URL: "http://127.0.0.1:3000",
  LOCAL_AI_WORKER_SECRET: STRONG_WORKER_SECRET,
  LOCAL_AI_WORKER_SKIP_PROCESSOR_HEALTH: "1",
});
assertExit(loopbackPreflight, 0, "loopback preflight");
assertIncludes(
  loopbackPreflight.stdout,
  "Local AI worker preflight passed.",
  "loopback preflight stdout",
);

const lanPreflight = await runWorkerPreflight("lan preflight", {
  LOCAL_AI_WORKER_HOSTED_BASE_URL: "https://hosted-alpha.example",
  LOCAL_AI_WORKER_PREFLIGHT_ONLY: "1",
  LOCAL_AI_WORKER_PROCESSOR_BASE_URL: "http://192.168.1.50:3000",
  LOCAL_AI_WORKER_SECRET: STRONG_WORKER_SECRET,
  LOCAL_AI_WORKER_SKIP_PROCESSOR_HEALTH: "1",
});
assertExit(lanPreflight, 0, "lan preflight");
assertIncludes(lanPreflight.stdout, "Local AI worker preflight passed.", "lan preflight stdout");

const legacySecretPreflight = await runWorkerPreflight("legacy secret preflight", {
  AI_WORKER_SECRET: STRONG_WORKER_SECRET,
  LOCAL_AI_WORKER_HOSTED_BASE_URL: "https://hosted-alpha.example",
  LOCAL_AI_WORKER_PREFLIGHT_ONLY: "1",
  LOCAL_AI_WORKER_PROCESSOR_BASE_URL: "http://127.0.0.1:3000",
  LOCAL_AI_WORKER_SKIP_PROCESSOR_HEALTH: "1",
});
assertExit(legacySecretPreflight, 0, "legacy secret preflight");
assertIncludes(
  legacySecretPreflight.stdout,
  "Local AI worker preflight passed.",
  "legacy secret preflight stdout",
);

const missingSecret = await runWorkerPreflight("missing secret preflight", {
  LOCAL_AI_WORKER_HOSTED_BASE_URL: "https://hosted-alpha.example",
  LOCAL_AI_WORKER_PREFLIGHT_ONLY: "1",
  LOCAL_AI_WORKER_PROCESSOR_BASE_URL: "http://127.0.0.1:3000",
  LOCAL_AI_WORKER_SKIP_PROCESSOR_HEALTH: "1",
});
assertExit(missingSecret, 1, "missing secret preflight");
assertIncludes(
  `${missingSecret.stdout}\n${missingSecret.stderr}`,
  "LOCAL_AI_WORKER_SECRET or AI_WORKER_SECRET is required.",
  "missing secret preflight output",
);

const weakSecret = await runWorkerPreflight("weak secret preflight", {
  LOCAL_AI_WORKER_HOSTED_BASE_URL: "https://hosted-alpha.example",
  LOCAL_AI_WORKER_PREFLIGHT_ONLY: "1",
  LOCAL_AI_WORKER_PROCESSOR_BASE_URL: "http://127.0.0.1:3000",
  LOCAL_AI_WORKER_SECRET: "short-secret",
  LOCAL_AI_WORKER_SKIP_PROCESSOR_HEALTH: "1",
});
assertExit(weakSecret, 1, "weak secret preflight");
assertIncludes(
  `${weakSecret.stdout}\n${weakSecret.stderr}`,
  "Private AI worker secret must be at least 24 characters.",
  "weak secret preflight output",
);

const publicProcessor = await runWorkerPreflight("public processor preflight", {
  LOCAL_AI_WORKER_HOSTED_BASE_URL: "https://hosted-alpha.example",
  LOCAL_AI_WORKER_PREFLIGHT_ONLY: "1",
  LOCAL_AI_WORKER_PROCESSOR_BASE_URL: "https://hosted-alpha.example",
  LOCAL_AI_WORKER_SECRET: STRONG_WORKER_SECRET,
  LOCAL_AI_WORKER_SKIP_PROCESSOR_HEALTH: "1",
});
assertExit(publicProcessor, 1, "public processor preflight");
assertIncludes(
  `${publicProcessor.stdout}\n${publicProcessor.stderr}`,
  "LOCAL_AI_WORKER_PROCESSOR_BASE_URL must point to a loopback, LAN, or .local private processor",
  "public processor preflight output",
);

const explicitPublicProcessor = await runWorkerPreflight("explicit public processor preflight", {
  LOCAL_AI_WORKER_ALLOW_HOSTED_PROCESSOR: "1",
  LOCAL_AI_WORKER_HOSTED_BASE_URL: "https://hosted-alpha.example",
  LOCAL_AI_WORKER_PREFLIGHT_ONLY: "1",
  LOCAL_AI_WORKER_PROCESSOR_BASE_URL: "https://hosted-alpha.example",
  LOCAL_AI_WORKER_SECRET: STRONG_WORKER_SECRET,
  LOCAL_AI_WORKER_SKIP_PROCESSOR_HEALTH: "1",
});
assertExit(explicitPublicProcessor, 0, "explicit public processor preflight");
assertIncludes(
  explicitPublicProcessor.stdout,
  "Local AI worker preflight passed.",
  "explicit public processor preflight stdout",
);

const loopRetryBackoff = await runWorkerPreflight("loop retry backoff", {
  LOCAL_AI_WORKER_BACKOFF_JITTER_MS: "0",
  LOCAL_AI_WORKER_BACKOFF_MAX_MS: "250",
  LOCAL_AI_WORKER_HOSTED_BASE_URL: "http://127.0.0.1:9",
  LOCAL_AI_WORKER_LOOP: "1",
  LOCAL_AI_WORKER_MAX_CONSECUTIVE_FAILURES: "1",
  LOCAL_AI_WORKER_POLL_MS: "250",
  LOCAL_AI_WORKER_PROCESSOR_BASE_URL: "http://127.0.0.1:3000",
  LOCAL_AI_WORKER_SECRET: STRONG_WORKER_SECRET,
  LOCAL_AI_WORKER_SKIP_PROCESSOR_HEALTH: "1",
});
assertExit(loopRetryBackoff, 1, "loop retry backoff");
assertIncludes(
  `${loopRetryBackoff.stdout}\n${loopRetryBackoff.stderr}`,
  "AI worker loop error 1; retrying in 250ms",
  "loop retry backoff output",
);

console.log("local AI worker preflight smoke passed");
