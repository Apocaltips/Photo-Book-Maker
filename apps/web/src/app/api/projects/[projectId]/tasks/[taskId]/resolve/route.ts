import {
  resolveProjectTask,
  updateTaskStatus,
} from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { authorizeProjectRequest } from "@/lib/server/auth";
import { mutationErrorResponse } from "@/lib/server/mutation-response";
import { updateProject } from "@/lib/server/project-store";
import { hydrateProjectForClient } from "@/lib/server/project-response";
import { getRequestOrigin } from "@/lib/server/request-origin";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ projectId: string; taskId: string }>;
  },
) {
  const { projectId, taskId } = await params;
  const auth = await authorizeProjectRequest(request, projectId, "edit");
  if ("response" in auth) {
    return auth.response;
  }
  const body = await request.json().catch(() => ({ status: "resolved" }));
  const status = body.status ?? "resolved";
  const locationLabel =
    typeof body.locationLabel === "string" ? body.locationLabel : undefined;
  try {
    const project = await updateProject(
      projectId,
      (current) =>
        status === "resolved"
          ? resolveProjectTask(current, taskId, { locationLabel })
          : updateTaskStatus(current, taskId, status),
      {
        expectedRevision: body.expectedRevision,
        activity: {
          actorEmail: auth.user.email,
          actorId: auth.user.id,
          message: `${auth.user.name} updated a project blocker.`,
          type: "task_resolved",
        },
      },
    );

    if (!project) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    return NextResponse.json({
      message: "Resolution task updated.",
      project: await hydrateProjectForClient(project, getRequestOrigin(request)),
    });
  } catch (error) {
    return mutationErrorResponse(error, "Unable to update this project blocker.");
  }
}
