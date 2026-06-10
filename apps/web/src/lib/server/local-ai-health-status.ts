import type { GenerationRun, Project } from "@photo-book-maker/core";
import { getAiWorkerQueueConfig } from "@/lib/server/ai-worker-auth";
import { checkLocalAiHealth } from "@/lib/server/book-generation-ai";
import { getProjectStoreMode, readProjects } from "@/lib/server/project-store";

const ACTIVE_RUN_STATUSES: GenerationRun["status"][] = [
  "analyzing_photos",
  "planning",
  "queued",
  "validating",
];

type RunEntry = {
  project: Project;
  run: GenerationRun;
};

function summarizeRun(entry: RunEntry) {
  return {
    completedAt: entry.run.completedAt,
    modelNames: entry.run.modelNames,
    plannerDiagnostics: entry.run.plannerDiagnostics ?? null,
    projectId: entry.project.id,
    projectRevision: entry.project.revision ?? 1,
    projectTitle: entry.project.title,
    qualityReport: entry.run.qualityReport ?? null,
    runId: entry.run.id,
    startedAt: entry.run.startedAt,
    status: entry.run.status,
    validationWarnings: entry.run.validationWarnings,
    workerAttemptCount: entry.run.workerAttemptCount ?? 0,
    workerHeartbeatAt: entry.run.workerHeartbeatAt,
    workerLeaseExpiresAt: entry.run.workerLeaseExpiresAt,
  };
}

function getPlannerMode(
  run: GenerationRun | undefined,
  config: Awaited<ReturnType<typeof checkLocalAiHealth>>["config"],
) {
  const planner = run?.modelNames.planner;
  if (!planner) {
    return "none";
  }

  if (planner === "deterministic-editorial-fallback") {
    return "deterministic-fallback";
  }

  if (planner === config.fallbackPlannerModel) {
    return "fallback-planner";
  }

  if (planner === config.plannerModel) {
    return "primary-planner";
  }

  return "custom-planner";
}

export async function getLocalAiHealthStatus() {
  const ai = await checkLocalAiHealth();
  const worker = getAiWorkerQueueConfig();
  const projects = await readProjects().catch(() => []);
  const runs = projects
    .flatMap((project) =>
      (project.generationRuns ?? []).map((run) => ({
        project,
        run,
      })),
    )
    .sort((left, right) => right.run.startedAt.localeCompare(left.run.startedAt));
  const latestRun = runs[0] ?? null;
  const lastSavedRun = runs.find((entry) => entry.run.status === "saved") ?? null;
  const savedRuns = runs.filter((entry) => entry.run.status === "saved").length;
  const failedRuns = runs.filter((entry) => entry.run.status === "failed").length;
  const activeRuns = runs.filter((entry) =>
    ACTIVE_RUN_STATUSES.includes(entry.run.status),
  ).length;
  const staleRuns = runs.filter((entry) => {
    if (!ACTIVE_RUN_STATUSES.includes(entry.run.status) || !entry.run.workerLeaseExpiresAt) {
      return false;
    }

    return Date.parse(entry.run.workerLeaseExpiresAt) <= Date.now();
  }).length;
  const latestPlannerMode = getPlannerMode(latestRun?.run, ai.config);
  const lastSavedPlannerMode = getPlannerMode(lastSavedRun?.run, ai.config);

  return {
    ai,
    lastSavedRun: lastSavedRun ? summarizeRun(lastSavedRun) : null,
    latestRun: latestRun ? summarizeRun(latestRun) : null,
    plannerStatus: {
      deterministicFallbackUsedInLastSaved:
        lastSavedPlannerMode === "deterministic-fallback",
      deterministicFallbackUsedInLatest: latestPlannerMode === "deterministic-fallback",
      fallbackUsedInLastSaved:
        lastSavedPlannerMode === "fallback-planner" ||
        lastSavedPlannerMode === "deterministic-fallback",
      fallbackUsedInLatest:
        latestPlannerMode === "fallback-planner" ||
        latestPlannerMode === "deterministic-fallback",
      lastSavedPlannerMode,
      latestPlannerMode,
    },
    projects,
    queue: {
      activeRuns,
      failedRuns,
      savedRuns,
      staleRuns,
      totalRuns: runs.length,
    },
    store: {
      mode: getProjectStoreMode(),
      projectCount: projects.length,
    },
    worker,
  };
}
