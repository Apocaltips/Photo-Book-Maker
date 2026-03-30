import { createMockProject } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { readProjects, writeProjects } from "@/lib/server/project-store";
import {
  hydrateProjectForClient,
  hydrateProjectsForClient,
} from "@/lib/server/project-response";

export async function GET() {
  return NextResponse.json({ projects: await hydrateProjectsForClient(await readProjects()) });
}

export async function POST(request: Request) {
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
}
