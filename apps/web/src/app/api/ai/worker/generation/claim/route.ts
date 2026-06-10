import {
  upsertGenerationRun,
  type GenerationRun,
  type Project,
} from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { authorizeAiWorkerRequest } from "@/lib/server/ai-worker-auth";
import {
  isRevisionConflictError,
  readProjects,
  updateProject,
} from "@/lib/server/project-store";

type ClaimBody = {
  leaseSeconds?: number;
  workerId?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function addProgress(run: GenerationRun, message: string) {
  return [...new Set([...run.progress, message])];
}

function isActiveWorkerRun(status: GenerationRun["status"]) {
  return status === "analyzing_photos" || status === "planning" || status === "validating";
}

function isClaimableRun(run: GenerationRun, nowMs: number) {
  if (run.status === "queued") {
    return true;
  }

  if (!isActiveWorkerRun(run.status) || !run.workerLeaseExpiresAt) {
    return false;
  }

  return Date.parse(run.workerLeaseExpiresAt) <= nowMs;
}

function findClaimCandidate(projects: Project[]) {
  const nowMs = Date.now();
  return projects
    .flatMap((project) =>
      (project.generationRuns ?? [])
        .filter((run) => isClaimableRun(run, nowMs))
        .map((run) => ({ project, run })),
    )
    .sort((left, right) => left.run.startedAt.localeCompare(right.run.startedAt))[0];
}

class ClaimRaceError extends Error {
  constructor() {
    super("Generation run is no longer claimable.");
    this.name = "ClaimRaceError";
  }
}

export async function POST(request: Request) {
  const unauthorized = authorizeAiWorkerRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const body = (await request.json().catch(() => ({}))) as ClaimBody;
  const workerId = body.workerId?.trim() || `worker-${crypto.randomUUID()}`;
  const leaseSeconds = Math.max(60, Math.min(body.leaseSeconds ?? 900, 3600));
  const candidate = findClaimCandidate(await readProjects());

  if (!candidate) {
    return NextResponse.json({ job: null });
  }

  const claimedAt = nowIso();
  const leaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
  let project: Project | null;

  try {
    project = await updateProject(candidate.project.id, (current) => {
      const run = current.generationRuns?.find((entry) => entry.id === candidate.run.id);
      if (!run || !isClaimableRun(run, Date.now())) {
        throw new ClaimRaceError();
      }

      return upsertGenerationRun(current, {
        ...run,
        progress: addProgress(run, `worker ${workerId} claimed generation job`),
        status: "analyzing_photos",
        workerClaimedAt: run.workerClaimedAt ?? claimedAt,
        workerHeartbeatAt: claimedAt,
        workerId,
        workerLeaseExpiresAt: leaseExpiresAt,
      });
    });
  } catch (error) {
    if (error instanceof ClaimRaceError || isRevisionConflictError(error)) {
      return NextResponse.json({ job: null });
    }

    throw error;
  }

  const claimedRun = project?.generationRuns?.find((run) => run.id === candidate.run.id);
  if (!project || claimedRun?.workerId !== workerId) {
    return NextResponse.json({ job: null });
  }

  return NextResponse.json({
    job: {
      expectedRevision: project.revision ?? 1,
      project,
      projectId: project.id,
      run: claimedRun,
      runId: claimedRun.id,
      workerId,
    },
  });
}
