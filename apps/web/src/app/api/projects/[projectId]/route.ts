import { findProjectById } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { readProjects, updateProject } from "@/lib/server/project-store";
import { hydrateProjectForClient } from "@/lib/server/project-response";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = findProjectById(await readProjects(), projectId);

  if (!project) {
    return NextResponse.json({ message: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({ project: await hydrateProjectForClient(project) });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
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
