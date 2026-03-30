import { finalizeProject } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { updateProject } from "@/lib/server/project-store";
import { hydrateProjectForClient } from "@/lib/server/project-response";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = await updateProject(projectId, (current) => finalizeProject(current));

  if (!project) {
    return NextResponse.json({ message: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({ project: await hydrateProjectForClient(project) });
}
