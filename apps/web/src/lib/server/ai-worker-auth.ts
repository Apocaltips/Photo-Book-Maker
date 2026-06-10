import { NextResponse } from "next/server";
import { createHash, createHmac, timingSafeEqual, randomUUID } from "node:crypto";

export type AiWorkerJobSignatureInput = {
  expectedRevision: number;
  projectDigest: string;
  projectId: string;
  runId: string;
  workerId: string;
  workerLeaseToken: string;
};

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

export function createAiWorkerLeaseToken() {
  return randomUUID();
}

export function hashAiWorkerLeaseToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isAiWorkerLeaseTokenValid(
  expectedHash: string | undefined,
  providedToken: string | undefined,
) {
  return (
    !expectedHash ||
    Boolean(providedToken && hashAiWorkerLeaseToken(providedToken) === expectedHash)
  );
}

export function hashAiWorkerJobProject(project: unknown) {
  return createHash("sha256").update(JSON.stringify(project)).digest("hex");
}

function getAiWorkerSignaturePayload(input: AiWorkerJobSignatureInput) {
  return JSON.stringify({
    expectedRevision: input.expectedRevision,
    projectDigest: input.projectDigest,
    projectId: input.projectId,
    runId: input.runId,
    version: 1,
    workerId: input.workerId,
    workerLeaseToken: input.workerLeaseToken,
  });
}

export function signAiWorkerJob(
  input: AiWorkerJobSignatureInput,
  secret = getAiWorkerSecret(),
) {
  if (!secret) {
    throw new Error("Local AI worker secret is not configured.");
  }

  return `v1:${createHmac("sha256", secret)
    .update(getAiWorkerSignaturePayload(input))
    .digest("hex")}`;
}

export function isAiWorkerJobSignatureValid(
  input: AiWorkerJobSignatureInput,
  signature: string | undefined,
  secret = getAiWorkerSecret(),
) {
  if (!signature || !secret) {
    return false;
  }

  const expected = signAiWorkerJob(input, secret);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
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
