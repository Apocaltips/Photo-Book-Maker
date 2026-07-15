import { NextResponse } from "next/server";
import {
  authorizeAiWorkerRequest,
  getAiWorkerQueueConfig,
} from "@/lib/server/ai-worker-auth";

export async function GET(request: Request) {
  const authorizationError = authorizeAiWorkerRequest(request);
  if (authorizationError) {
    return authorizationError;
  }

  const config = getAiWorkerQueueConfig();

  return NextResponse.json({
    queue: {
      enabled: config.queueEnabled,
      maxAttempts: config.maxAttempts,
      maxLeaseSeconds: config.maxLeaseSeconds,
      minLeaseSeconds: config.minLeaseSeconds,
    },
    status: config.queueEnabled ? "ready" : "disabled",
  });
}
