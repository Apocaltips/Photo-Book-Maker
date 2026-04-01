import { NextResponse } from "next/server";
import { authorizeProjectRequest } from "@/lib/server/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const auth = await authorizeProjectRequest(request, projectId, "manage");
  if ("response" in auth) {
    return auth.response;
  }

  return NextResponse.json({
    message:
      "Direct print ordering is not configured in this build. Export the proof PDF and place the order with your print vendor.",
  }, { status: 501 });
}
