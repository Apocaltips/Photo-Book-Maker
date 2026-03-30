import {
  updateTaskStatus,
} from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { updateProject } from "@/lib/server/project-store";
import { hydrateProjectForClient } from "@/lib/server/project-response";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ projectId: string; taskId: string }>;
  },
) {
  const { projectId, taskId } = await params;
  const body = await request.json().catch(() => ({ status: "resolved" }));
  const status = body.status ?? "resolved";
  const project = await updateProject(projectId, (current) =>
    updateTaskStatus(current, taskId, status),
  );

  if (!project) {
    return NextResponse.json({ message: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({
    message: "Resolution task updated.",
    project: await hydrateProjectForClient(project),
  });
}
