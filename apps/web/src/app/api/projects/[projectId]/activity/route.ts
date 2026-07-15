import { NextResponse } from "next/server";
import { authorizeProjectRequest } from "@/lib/server/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const auth = await authorizeProjectRequest(request, projectId, "view");
  if ("response" in auth) {
    return auth.response;
  }

  return NextResponse.json({
    activity: auth.project.activity ?? [],
    projectId,
    revision: auth.project.revision ?? 1,
  });
}
