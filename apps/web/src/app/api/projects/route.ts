import { createProjectRecord } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import {
  filterProjectsForUser,
  getAuthenticatedUser,
  unauthorizedResponse,
} from "@/lib/server/auth";
import { readProjects, writeProjects } from "@/lib/server/project-store";
import {
  hydrateProjectForClient,
  hydrateProjectsForClient,
} from "@/lib/server/project-response";
import { getRequestOrigin } from "@/lib/server/request-origin";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return unauthorizedResponse();
    }
    const origin = getRequestOrigin(request);

    return NextResponse.json({
      projects: await hydrateProjectsForClient(
        filterProjectsForUser(await readProjects(), user.email),
        origin,
      ),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error loading projects.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return unauthorizedResponse();
    }

    const body = await request.json();
    const project = createProjectRecord({
      ...body,
      ownerEmail: user.email,
      ownerName: user.name,
    });
    const projects = await readProjects();
    await writeProjects([project, ...projects]);

    return NextResponse.json(
      {
        message: "Project created.",
        project: await hydrateProjectForClient(project, getRequestOrigin(request)),
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error creating project.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
