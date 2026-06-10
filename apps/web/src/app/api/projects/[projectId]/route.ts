import { NextResponse } from "next/server";
import { authorizeProjectRequest } from "@/lib/server/auth";
import { mutationErrorResponse } from "@/lib/server/mutation-response";
import { updateProject } from "@/lib/server/project-store";
import { hydrateProjectForClient } from "@/lib/server/project-response";
import { getRequestOrigin } from "@/lib/server/request-origin";

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
    project: await hydrateProjectForClient(auth.project, getRequestOrigin(request)),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const auth = await authorizeProjectRequest(request, projectId, "edit");
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const body = (await request.json()) as {
      expectedRevision?: number;
      selectedThemeId?: string;
    };
    const project = await updateProject(
      projectId,
      (current) => ({
        ...current,
        selectedThemeId: body.selectedThemeId ?? current.selectedThemeId,
        bookDraft: {
          ...current.bookDraft,
          themeId: body.selectedThemeId ?? current.bookDraft.themeId,
        },
      }),
      {
        expectedRevision: body.expectedRevision,
        activity: {
          actorEmail: auth.user.email,
          actorId: auth.user.id,
          message: `${auth.user.name} changed the book theme.`,
          type: "template_changed",
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
    return mutationErrorResponse(error, "Unable to update this project.");
  }
}
