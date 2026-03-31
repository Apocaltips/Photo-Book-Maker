import {
  publishCurrentDraft,
  type BookDraftEditorState,
  type Project,
} from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { authorizeProjectRequest } from "@/lib/server/auth";
import { updateProject } from "@/lib/server/project-store";
import { hydrateProjectForClient } from "@/lib/server/project-response";

type PublishDraftBody = {
  bookDraft?: Project["bookDraft"];
  draftEditorState?: BookDraftEditorState;
  name?: string;
  selectedThemeId?: string;
  subtitle?: string;
  title?: string;
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

  const body = (await request.json()) as PublishDraftBody;
  const project = await updateProject(projectId, (current) =>
    publishCurrentDraft(current, body.name ?? "", body),
  );

  if (!project) {
    return NextResponse.json({ message: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({
    message: "Draft published.",
    project: await hydrateProjectForClient(project),
  });
}
