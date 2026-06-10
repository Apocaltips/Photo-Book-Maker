import {
  normalizeProjectRecord,
  upsertGenerationRun,
  type GenerationRun,
  type Project,
} from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { authorizeAiWorkerRequest } from "@/lib/server/ai-worker-auth";
import { mutationErrorResponse } from "@/lib/server/mutation-response";
import { isRevisionConflictError, updateProject } from "@/lib/server/project-store";

type CompleteBody = {
  expectedRevision?: number;
  project?: Project;
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

function isActiveWorkerRun(status: GenerationRun["status"]) {
  return status === "analyzing_photos" || status === "planning" || status === "validating";
}

export async function POST(request: Request) {
  const unauthorized = authorizeAiWorkerRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as CompleteBody;
    if (
      !body.projectId ||
      !body.runId ||
      !body.workerId ||
      !body.project ||
      typeof body.expectedRevision !== "number"
    ) {
      return NextResponse.json(
        { message: "projectId, runId, workerId, expectedRevision, and project are required." },
        { status: 400 },
      );
    }

    if (body.project.id !== body.projectId) {
      return NextResponse.json(
        { message: "Completed project payload does not match projectId." },
        { status: 400 },
      );
    }

    const completedProject = normalizeProjectRecord(body.project);
    const completedRun = completedProject.generationRuns?.find(
      (entry) => entry.id === body.runId,
    );
    if (!completedRun || completedRun.status !== "saved") {
      return NextResponse.json(
        { message: "Completed project payload must include the saved generation run." },
        { status: 400 },
      );
    }

    const project = await updateProject(
      body.projectId,
      (current) => {
        const currentRun = current.generationRuns?.find((entry) => entry.id === body.runId);
        if (!currentRun) {
          throw new WorkerRunConflictError("Generation run was not found.");
        }

        if (currentRun.workerId !== body.workerId) {
          throw new WorkerRunConflictError("Generation run is claimed by another worker.");
        }

        if (!isActiveWorkerRun(currentRun.status)) {
          throw new WorkerRunConflictError(
            `Generation run is already ${currentRun.status} and cannot be completed.`,
          );
        }

        const completedRunWithClaim: GenerationRun = {
          ...completedRun,
          workerClaimedAt: currentRun.workerClaimedAt,
          workerHeartbeatAt: currentRun.workerHeartbeatAt,
          workerId: currentRun.workerId,
          workerLeaseExpiresAt: currentRun.workerLeaseExpiresAt,
        };

        return upsertGenerationRun(
          {
            ...current,
            bookDraft: completedProject.bookDraft,
            draftEditorState: completedProject.draftEditorState,
            generationQuestionnaire: completedProject.generationQuestionnaire,
            photoInsights: completedProject.photoInsights,
            publishedDrafts: completedProject.publishedDrafts,
            selectedThemeId: completedProject.selectedThemeId,
          },
          completedRunWithClaim,
        );
      },
      {
        activity: {
          actorEmail: "local-ai-worker@photo-book-maker.local",
          actorId: body.workerId ?? "local-ai-worker",
          message: "Local AI worker generated an AI-designed book draft.",
          type: "draft_ai_generated",
        },
        expectedRevision: body.expectedRevision,
      },
    );

    if (!project) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    const run = project.generationRuns?.find((entry) => entry.id === body.runId);
    return NextResponse.json({ project, run });
  } catch (error) {
    if (isRevisionConflictError(error)) {
      return mutationErrorResponse(error, "Unable to complete this AI worker job.");
    }

    if (error instanceof WorkerRunConflictError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "AI worker completion failed." },
      { status: 500 },
    );
  }
}
