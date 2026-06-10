import { NextResponse } from "next/server";

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
