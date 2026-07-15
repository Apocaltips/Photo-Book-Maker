import { markGenerationRunFailed } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import {
  authorizeAiWorkerRequest,
  isAiWorkerLeaseTokenValid,
} from "@/lib/server/ai-worker-auth";
import { isRevisionConflictError, updateProject } from "@/lib/server/project-store";

type FailBody = {
  errorMessage?: string;
  projectId?: string;
  runId?: string;
  workerId?: string;
  workerLeaseToken?: string;
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

  const body = (await request.json().catch(() => ({}))) as FailBody;
  if (!body.projectId || !body.runId || !body.workerId) {
    return NextResponse.json(
      { message: "projectId, runId, and workerId are required." },
      { status: 400 },
    );
  }

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

        if (!isAiWorkerLeaseTokenValid(run.workerLeaseTokenHash, body.workerLeaseToken)) {
          throw new WorkerRunConflictError("Generation run lease token did not match.");
        }

        if (run.status === "saved") {
          throw new WorkerRunConflictError("Saved generation runs cannot be marked failed.");
        }

        if (run.status === "failed") {
          return current;
        }

        return markGenerationRunFailed(
          current,
          body.runId!,
          body.errorMessage ?? "AI worker failed the generation job.",
        );
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
      { message: error instanceof Error ? error.message : "AI worker failure update failed." },
      { status: 500 },
    );
  }

  if (!project) {
    return NextResponse.json({ message: "Project not found." }, { status: 404 });
  }

  const run = project.generationRuns?.find((entry) => entry.id === body.runId);
  return NextResponse.json({ projectId: project.id, run });
}
