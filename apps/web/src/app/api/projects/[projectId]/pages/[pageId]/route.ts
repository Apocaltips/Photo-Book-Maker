import { updateBookPageCopy } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { authorizeProjectRequest } from "@/lib/server/auth";
import { mutationErrorResponse } from "@/lib/server/mutation-response";
import { updateProject } from "@/lib/server/project-store";
import { hydrateProjectForClient } from "@/lib/server/project-response";
import { getRequestOrigin } from "@/lib/server/request-origin";

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ pageId: string; projectId: string }>;
  },
) {
  const { pageId, projectId } = await params;
  const auth = await authorizeProjectRequest(request, projectId, "edit");
  if ("response" in auth) {
    return auth.response;
  }

  const body = (await request.json()) as {
    caption?: string;
    confirmed?: boolean;
    expectedRevision?: number;
    title?: string;
  };

  try {
    const project = await updateProject(
      projectId,
      (current) =>
        updateBookPageCopy(current, pageId, {
          title: body.title,
          caption: body.caption,
          confirmed: body.confirmed,
        }),
      {
        expectedRevision: body.expectedRevision,
        activity: {
          actorEmail: auth.user.email,
          actorId: auth.user.id,
          message: `${auth.user.name} edited spread copy.`,
          type: "draft_saved",
        },
      },
    );

    if (!project) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    return NextResponse.json({
      message: "Book page copy updated.",
      project: await hydrateProjectForClient(project, getRequestOrigin(request)),
    });
  } catch (error) {
    return mutationErrorResponse(error, "Unable to update this spread.");
  }
}
