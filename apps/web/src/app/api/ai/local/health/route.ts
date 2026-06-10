import { NextResponse } from "next/server";
import { getLocalAiHealthStatus } from "@/lib/server/local-ai-health-status";

export async function GET() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.LOCAL_AI_HEALTH_PUBLIC !== "1"
  ) {
    return NextResponse.json(
      { message: "Local AI health is disabled in production." },
      { status: 404 },
    );
  }

  const status = await getLocalAiHealthStatus();

  return NextResponse.json({
    ai: status.ai,
    lastSavedRun: status.lastSavedRun,
    latestRun: status.latestRun,
    plannerStatus: status.plannerStatus,
    queue: status.queue,
    store: status.store,
  });
}
