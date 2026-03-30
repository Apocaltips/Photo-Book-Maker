import { addCollaborator } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { updateProject } from "@/lib/server/project-store";
import { hydrateProjectForClient } from "@/lib/server/project-response";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const body = await request.json();
  const updatedProject = await updateProject(projectId, (project) =>
    addCollaborator(project, body),
  );

  if (!updatedProject) {
    return NextResponse.json({ message: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({
    message: "Collaborator invite recorded.",
    project: await hydrateProjectForClient(updatedProject),
  });
}
