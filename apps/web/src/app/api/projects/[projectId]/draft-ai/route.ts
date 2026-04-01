import { type BookDraftEditorState, type Project } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { refreshProjectDraftWithAi } from "@/lib/server/book-draft-ai";
import { authorizeProjectRequest } from "@/lib/server/auth";
import { updateProject } from "@/lib/server/project-store";
import { hydrateProjectForClient } from "@/lib/server/project-response";

type DraftAiBody = {
  bookDraft?: Project["bookDraft"];
  draftEditorState?: BookDraftEditorState;
  selectedThemeId?: string;
  subtitle?: string;
  title?: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const auth = await authorizeProjectRequest(request, projectId, "edit");
    if ("response" in auth) {
      return auth.response;
    }

    const body = (await request.json()) as DraftAiBody;
    const project = await updateProject(projectId, (current) =>
      refreshProjectDraftWithAi(current, body),
    );

    if (!project) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    return NextResponse.json({
      message: "AI draft suggestions applied.",
      project: await hydrateProjectForClient(project),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI draft refresh failed.";

    return NextResponse.json(
      { message },
      {
        status: /openai|ai draft refresh is not configured/i.test(message) ? 503 : 502,
      },
    );
  }
}
