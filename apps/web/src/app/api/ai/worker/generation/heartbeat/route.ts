import { upsertGenerationRun } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import {
  authorizeAiWorkerRequest,
  normalizeAiWorkerLeaseSeconds,
} from "@/lib/server/ai-worker-auth";
import { isRevisionConflictError, updateProject } from "@/lib/server/project-store";

type HeartbeatBody = {
  leaseSeconds?: number;
  projectId?: string;
  runId?: string;
  workerId?: string;
};

class WorkerRunConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerRunConflictError";
  }
}

export async function POST(request: Request) {
  const unauthorized = authorizeAiWorkerRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const body = (await request.json().catch(() => ({}))) as HeartbeatBody;
  if (!body.projectId || !body.runId || !body.workerId) {
    return NextResponse.json(
      { message: "projectId, runId, and workerId are required." },
      { status: 400 },
    );
  }

  const heartbeatAt = new Date().toISOString();
  const leaseSeconds = normalizeAiWorkerLeaseSeconds(body.leaseSeconds);
  const workerLeaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000).toISOString();
  let project;

  try {
    project = await updateProject(
      body.projectId,
      (current) => {
        const run = current.generationRuns?.find((entry) => entry.id === body.runId);
        if (!run) {
          throw new WorkerRunConflictError("Generation run was not found.");
        }

        if (run.workerId !== body.workerId) {
          throw new WorkerRunConflictError("Generation run is claimed by another worker.");
        }

        if (run.status === "saved" || run.status === "failed") {
          throw new WorkerRunConflictError(
            `Generation run is already ${run.status} and cannot be heartbeated.`,
          );
        }

        return upsertGenerationRun(current, {
          ...run,
          workerHeartbeatAt: heartbeatAt,
          workerLeaseExpiresAt,
        });
      },
      {
        skipRevisionAdvance: true,
      },
    );
  } catch (error) {
    if (error instanceof WorkerRunConflictError || isRevisionConflictError(error)) {
      return NextResponse.json(
        { message: error instanceof Error ? error.message : "Generation run changed." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "AI worker heartbeat failed." },
      { status: 500 },
    );
  }

  if (!project) {
    return NextResponse.json({ message: "Project not found." }, { status: 404 });
  }

  const run = project.generationRuns?.find((entry) => entry.id === body.runId);
  return NextResponse.json({ projectId: project.id, run });
}
