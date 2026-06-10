import { NextResponse } from "next/server";
import { authorizeProjectRequest } from "@/lib/server/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; runId: string }> },
) {
  const { projectId, runId } = await params;
  const auth = await authorizeProjectRequest(request, projectId, "view");
  if ("response" in auth) {
    return auth.response;
  }

  const run = auth.project.generationRuns?.find((entry) => entry.id === runId);
  if (!run) {
    return NextResponse.json({ message: "Generation run not found." }, { status: 404 });
  }

  return NextResponse.json({
    projectId,
    revision: auth.project.revision ?? 1,
    run,
  });
}
