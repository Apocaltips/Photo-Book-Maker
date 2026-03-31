import { saveWorkingDraft, type BookDraftEditorState, type Project } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { authorizeProjectRequest } from "@/lib/server/auth";
import { updateProject } from "@/lib/server/project-store";
import { hydrateProjectForClient } from "@/lib/server/project-response";

type DraftRequestBody = {
  bookDraft?: Project["bookDraft"];
  draftEditorState?: BookDraftEditorState;
  selectedThemeId?: string;
  subtitle?: string;
  title?: string;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const auth = await authorizeProjectRequest(request, projectId, "edit");
  if ("response" in auth) {
    return auth.response;
  }

  const body = (await request.json()) as DraftRequestBody;
  const project = await updateProject(projectId, (current) => saveWorkingDraft(current, body));

  if (!project) {
    return NextResponse.json({ message: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({
    message: "Working draft saved.",
    project: await hydrateProjectForClient(project),
  });
}
