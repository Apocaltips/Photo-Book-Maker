import { createMockProject } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { readProjects, writeProjects } from "@/lib/server/project-store";
import {
  hydrateProjectForClient,
  hydrateProjectsForClient,
} from "@/lib/server/project-response";

export async function GET() {
  try {
    return NextResponse.json({
      projects: await hydrateProjectsForClient(await readProjects()),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error loading projects.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const project = createMockProject(body);
    const projects = await readProjects();
    await writeProjects([project, ...projects]);

    return NextResponse.json(
      {
        message: "Project created.",
        project: await hydrateProjectForClient(project),
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error creating project.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
