import { togglePageApproval } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { updateProject } from "@/lib/server/project-store";
import { hydrateProjectForClient } from "@/lib/server/project-response";

export async function POST(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ pageId: string; projectId: string }>;
  },
) {
  const { pageId, projectId } = await params;
  const project = await updateProject(projectId, (current) =>
    togglePageApproval(current, pageId),
  );

  if (!project) {
    return NextResponse.json({ message: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({
    message: "Book page approval updated.",
    project: await hydrateProjectForClient(project),
  });
}
