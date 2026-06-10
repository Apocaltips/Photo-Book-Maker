import { NextResponse } from "next/server";

function parsePositiveIntegerEnv(value: string | undefined, fallback: number, min = 1) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed)) {
    return Math.max(min, fallback);
  }

  return Math.max(min, parsed);
}

export function getAiWorkerSecret() {
  return process.env.LOCAL_AI_WORKER_SECRET ?? process.env.AI_WORKER_SECRET ?? null;
}

export function isAiWorkerQueueEnabled() {
  const secret = getAiWorkerSecret();

  return Boolean(
    secret &&
      (process.env.LOCAL_AI_WORKER_ENABLED === "1" ||
        process.env.NODE_ENV === "production"),
  );
}

export function getAiWorkerMaxAttempts() {
  return Math.min(
    parsePositiveIntegerEnv(process.env.LOCAL_AI_WORKER_MAX_ATTEMPTS, 3),
    10,
  );
}

export function getAiWorkerMinLeaseSeconds() {
  return Math.min(
    parsePositiveIntegerEnv(process.env.LOCAL_AI_WORKER_MIN_LEASE_SECONDS, 60),
    3600,
  );
}

export function getAiWorkerMaxLeaseSeconds() {
  return Math.max(
    getAiWorkerMinLeaseSeconds(),
    Math.min(
      parsePositiveIntegerEnv(process.env.LOCAL_AI_WORKER_MAX_LEASE_SECONDS, 3600),
      7200,
    ),
  );
}

export function normalizeAiWorkerLeaseSeconds(value?: number) {
  const requestedLeaseSeconds =
    typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 900;
  const minLeaseSeconds = getAiWorkerMinLeaseSeconds();
  const maxLeaseSeconds = getAiWorkerMaxLeaseSeconds();

  return Math.max(minLeaseSeconds, Math.min(requestedLeaseSeconds, maxLeaseSeconds));
}

export function getAiWorkerQueueConfig() {
  return {
    maxAttempts: getAiWorkerMaxAttempts(),
    maxLeaseSeconds: getAiWorkerMaxLeaseSeconds(),
    minLeaseSeconds: getAiWorkerMinLeaseSeconds(),
    queueEnabled: isAiWorkerQueueEnabled(),
    secretConfigured: Boolean(getAiWorkerSecret()),
  };
}

export function authorizeAiWorkerRequest(request: Request) {
  const secret = getAiWorkerSecret();

  if (!secret) {
    return NextResponse.json(
      { message: "Local AI worker secret is not configured." },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization");
  const bearer = authorization?.replace(/^Bearer\s+/i, "").trim();
  const headerSecret = request.headers.get("x-photo-book-ai-worker-secret");

  if (bearer !== secret && headerSecret !== secret) {
    return NextResponse.json(
      { message: "AI worker authorization failed." },
      { status: 401 },
    );
  }

  return null;
}
