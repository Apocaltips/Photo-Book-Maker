import { updateBookPageCopy } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { authorizeProjectRequest } from "@/lib/server/auth";
import { updateProject } from "@/lib/server/project-store";
import { hydrateProjectForClient } from "@/lib/server/project-response";

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
    title?: string;
  };

  const project = await updateProject(projectId, (current) =>
    updateBookPageCopy(current, pageId, {
      title: body.title,
      caption: body.caption,
      confirmed: body.confirmed,
    }),
  );

  if (!project) {
    return NextResponse.json({ message: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({
    message: "Book page copy updated.",
    project: await hydrateProjectForClient(project),
  });
}
