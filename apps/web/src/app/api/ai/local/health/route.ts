import { NextResponse } from "next/server";
import { checkLocalAiHealth } from "@/lib/server/book-generation-ai";
import { getProjectStoreMode, readProjects } from "@/lib/server/project-store";

export async function GET() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.LOCAL_AI_HEALTH_PUBLIC !== "1"
  ) {
    return NextResponse.json(
      { message: "Local AI health is disabled in production." },
      { status: 404 },
    );
  }

  const ai = await checkLocalAiHealth();
  const projects = await readProjects().catch(() => []);
  const runs = projects.flatMap((project) =>
    (project.generationRuns ?? []).map((run) => ({
      projectId: project.id,
      projectTitle: project.title,
      revision: project.revision ?? 1,
      run,
    })),
  );
  const latestRun = runs.sort((left, right) =>
    right.run.startedAt.localeCompare(left.run.startedAt),
  )[0];
  const savedRuns = runs.filter((entry) => entry.run.status === "saved").length;
  const failedRuns = runs.filter((entry) => entry.run.status === "failed").length;
  const activeRuns = runs.filter((entry) =>
    ["analyzing_photos", "planning", "queued", "validating"].includes(entry.run.status),
  ).length;

  return NextResponse.json({
    ai,
    queue: {
      activeRuns,
      failedRuns,
      savedRuns,
      totalRuns: runs.length,
    },
    latestRun: latestRun
      ? {
          completedAt: latestRun.run.completedAt,
          modelNames: latestRun.run.modelNames,
          projectId: latestRun.projectId,
          projectRevision: latestRun.revision,
          projectTitle: latestRun.projectTitle,
          qualityReport: latestRun.run.qualityReport ?? null,
          runId: latestRun.run.id,
          startedAt: latestRun.run.startedAt,
          status: latestRun.run.status,
          validationWarnings: latestRun.run.validationWarnings,
        }
      : null,
    store: {
      mode: getProjectStoreMode(),
      projectCount: projects.length,
    },
  });
}
