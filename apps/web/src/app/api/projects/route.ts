import { createProjectRecord } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  filterProjectsForUser,
  getAuthenticatedUser,
  unauthorizedResponse,
} from "@/lib/server/auth";
import { insertProject, readProjects } from "@/lib/server/project-store";
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
        filterProjectsForUser(await readProjects(), user),
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
      ownerId: user.id,
      ownerName: user.name,
      projectId: `${body.type === "yearbook" ? "yearbook" : "trip"}-${randomUUID()}`,
    });
    await insertProject(project);

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
