import { toggleMustIncludePhoto } from "@photo-book-maker/core";
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
    params: Promise<{ projectId: string; photoId: string }>;
  },
) {
  const { projectId, photoId } = await params;
  const auth = await authorizeProjectRequest(request, projectId, "edit");
  if ("response" in auth) {
    return auth.response;
  }
  try {
    const body = (await request.json().catch(() => ({}))) as {
      expectedRevision?: number;
    };
    const project = await updateProject(
      projectId,
      (current) => toggleMustIncludePhoto(current, photoId),
      {
        expectedRevision: body.expectedRevision,
        activity: {
          actorEmail: auth.user.email,
          actorId: auth.user.id,
          message: `${auth.user.name} updated a must-include photo.`,
          type: "photo_curated",
        },
      },
    );

    if (!project) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    return NextResponse.json({
      project: await hydrateProjectForClient(project, getRequestOrigin(request)),
    });
  } catch (error) {
    return mutationErrorResponse(error, "Unable to update this photo.");
  }
}
