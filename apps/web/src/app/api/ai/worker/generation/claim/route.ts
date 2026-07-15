import {
  markGenerationRunFailed,
  upsertGenerationRun,
  type GenerationRun,
  type Project,
} from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import {
  authorizeAiWorkerRequest,
  createAiWorkerLeaseToken,
  getAiWorkerMaxAttempts,
  hashAiWorkerJobProject,
  hashAiWorkerLeaseToken,
  normalizeAiWorkerLeaseSeconds,
  signAiWorkerJob,
} from "@/lib/server/ai-worker-auth";
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

function getWorkerAttemptCount(run: GenerationRun) {
  return run.workerAttemptCount ?? 0;
}

function isLeaseExpired(run: GenerationRun, nowMs: number) {
  return Boolean(run.workerLeaseExpiresAt && Date.parse(run.workerLeaseExpiresAt) <= nowMs);
}

function isClaimableRun(run: GenerationRun, nowMs: number, maxAttempts: number) {
  if (getWorkerAttemptCount(run) >= maxAttempts) {
    return false;
  }

  if (run.status === "queued") {
    return true;
  }

  if (!isActiveWorkerRun(run.status)) {
    return false;
  }

  return isLeaseExpired(run, nowMs);
}

function isExhaustedRun(run: GenerationRun, nowMs: number, maxAttempts: number) {
  if (getWorkerAttemptCount(run) < maxAttempts) {
    return false;
  }

  if (run.status === "queued") {
    return true;
  }

  return isActiveWorkerRun(run.status) && isLeaseExpired(run, nowMs);
}

function findClaimCandidate(projects: Project[], maxAttempts: number) {
  const nowMs = Date.now();
  return projects
    .flatMap((project) =>
      (project.generationRuns ?? [])
        .filter((run) => isClaimableRun(run, nowMs, maxAttempts))
        .map((run) => ({ project, run })),
    )
    .sort((left, right) => left.run.startedAt.localeCompare(right.run.startedAt))[0];
}

function findExhaustedCandidate(projects: Project[], maxAttempts: number) {
  const nowMs = Date.now();
  return projects
    .flatMap((project) =>
      (project.generationRuns ?? [])
        .filter((run) => isExhaustedRun(run, nowMs, maxAttempts))
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
  const maxAttempts = getAiWorkerMaxAttempts();
  const workerId = body.workerId?.trim() || `worker-${crypto.randomUUID()}`;
  const leaseSeconds = normalizeAiWorkerLeaseSeconds(body.leaseSeconds);
  const projects = await readProjects();
  const exhaustedCandidate = findExhaustedCandidate(projects, maxAttempts);

  if (exhaustedCandidate) {
    const message = `Generation run exceeded ${maxAttempts} local AI worker attempt(s).`;

    try {
      const project = await updateProject(
        exhaustedCandidate.project.id,
        (current) => {
          const run = current.generationRuns?.find(
            (entry) => entry.id === exhaustedCandidate.run.id,
          );
          if (!run || !isExhaustedRun(run, Date.now(), maxAttempts)) {
            throw new ClaimRaceError();
          }

          return markGenerationRunFailed(current, run.id, message);
        },
        {
          skipRevisionAdvance: true,
        },
      );
      const run = project?.generationRuns?.find(
        (entry) => entry.id === exhaustedCandidate.run.id,
      );

      return NextResponse.json({
        failedRun: run ?? null,
        job: null,
        message,
      });
    } catch (error) {
      if (!(error instanceof ClaimRaceError) && !isRevisionConflictError(error)) {
        throw error;
      }
    }
  }

  const candidate = findClaimCandidate(await readProjects(), maxAttempts);

  if (!candidate) {
    return NextResponse.json({ job: null });
  }

  const claimedAt = nowIso();
  const workerLeaseToken = createAiWorkerLeaseToken();
  const leaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
  let project: Project | null;

  try {
    project = await updateProject(candidate.project.id, (current) => {
      const run = current.generationRuns?.find((entry) => entry.id === candidate.run.id);
      if (!run || !isClaimableRun(run, Date.now(), maxAttempts)) {
        throw new ClaimRaceError();
      }

      const attemptCount = getWorkerAttemptCount(run) + 1;
      return upsertGenerationRun(current, {
        ...run,
        progress: addProgress(
          run,
          `worker ${workerId} claimed generation job (attempt ${attemptCount}/${maxAttempts})`,
        ),
        status: "analyzing_photos",
        workerAttemptCount: attemptCount,
        workerClaimedAt: run.workerClaimedAt ?? claimedAt,
        workerHeartbeatAt: claimedAt,
        workerId,
        workerLeaseExpiresAt: leaseExpiresAt,
        workerLeaseTokenHash: hashAiWorkerLeaseToken(workerLeaseToken),
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

  const expectedRevision = project.revision ?? 1;
  const projectDigest = hashAiWorkerJobProject(project);
  return NextResponse.json({
    job: {
      expectedRevision,
      jobSignature: signAiWorkerJob({
        expectedRevision,
        projectDigest,
        projectId: project.id,
        runId: claimedRun.id,
        workerId,
        workerLeaseToken,
      }),
      project,
      projectDigest,
      projectId: project.id,
      run: claimedRun,
      runId: claimedRun.id,
      workerLeaseToken,
      workerId,
    },
  });
}
