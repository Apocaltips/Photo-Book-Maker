import {
  publishCurrentDraft,
  type BookDraftEditorState,
  type Project,
} from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { authorizeProjectRequest } from "@/lib/server/auth";
import { mutationErrorResponse } from "@/lib/server/mutation-response";
import { updateProject } from "@/lib/server/project-store";
import { hydrateProjectForClient } from "@/lib/server/project-response";
import { getRequestOrigin } from "@/lib/server/request-origin";

type PublishDraftBody = {
  bookDraft?: Project["bookDraft"];
  draftEditorState?: BookDraftEditorState;
  name?: string;
  selectedThemeId?: string;
  subtitle?: string;
  title?: string;
  expectedRevision?: number;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const auth = await authorizeProjectRequest(request, projectId, "edit");
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const body = (await request.json()) as PublishDraftBody;
    const draftName = body.name ?? "";
    const project = await updateProject(
      projectId,
      (current) => publishCurrentDraft(current, draftName, body),
      {
        expectedRevision: body.expectedRevision,
        activity: {
          actorEmail: auth.user.email,
          actorId: auth.user.id,
          message: `${auth.user.name} published ${draftName.trim() || "a draft"}.`,
          type: "draft_published",
        },
      },
    );

    if (!project) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    return NextResponse.json({
      message: "Draft published.",
      project: await hydrateProjectForClient(project, getRequestOrigin(request)),
    });
  } catch (error) {
    return mutationErrorResponse(error, "Unable to publish this draft.");
  }
}
