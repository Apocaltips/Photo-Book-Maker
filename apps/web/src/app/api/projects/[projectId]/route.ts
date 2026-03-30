import { NextResponse } from "next/server";
import { authorizeProjectRequest } from "@/lib/server/auth";
import { updateProject } from "@/lib/server/project-store";
import { hydrateProjectForClient } from "@/lib/server/project-response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const auth = await authorizeProjectRequest(request, projectId, "view");
  if ("response" in auth) {
    return auth.response;
  }

  return NextResponse.json({ project: await hydrateProjectForClient(auth.project) });
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
  const body = (await request.json()) as { selectedThemeId?: string };

  const project = await updateProject(projectId, (current) => ({
    ...current,
    selectedThemeId: body.selectedThemeId ?? current.selectedThemeId,
    bookDraft: {
      ...current.bookDraft,
      themeId: body.selectedThemeId ?? current.bookDraft.themeId,
    },
  }));

  if (!project) {
    return NextResponse.json({ message: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({ project: await hydrateProjectForClient(project) });
}
