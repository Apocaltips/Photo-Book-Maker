import {
  createGenerationRun,
  markGenerationRunFailed,
  upsertGenerationRun,
  type BookGenerationQuestionnaireAnswers,
  type GenerationRun,
} from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { authorizeProjectRequest } from "@/lib/server/auth";
import { isAiWorkerQueueEnabled } from "@/lib/server/ai-worker-auth";
import { generateProjectBookWithLocalAi } from "@/lib/server/book-generation-ai";
import { mutationErrorResponse } from "@/lib/server/mutation-response";
import {
  hydrateProjectForClient,
  sanitizeGenerationRunForClient,
} from "@/lib/server/project-response";
import { isRevisionConflictError, updateProject } from "@/lib/server/project-store";
import { getRequestOrigin } from "@/lib/server/request-origin";

type GenerationRunBody = {
  expectedRevision?: number;
  questionnaire?: Partial<BookGenerationQuestionnaireAnswers>;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  let failureProjectId: string | undefined;
  let failureRunId: string | undefined;

  try {
    const { projectId } = await params;
    failureProjectId = projectId;
    const directLocalAiAllowed =
      process.env.NODE_ENV !== "production" ||
      process.env.LOCAL_AI_DIRECT_IN_PRODUCTION === "1";
    const queueForWorker = isAiWorkerQueueEnabled();
    if (!directLocalAiAllowed && !queueForWorker) {
      return NextResponse.json(
        {
          message:
            "Local AI direct generation is disabled in production. Configure LOCAL_AI_WORKER_SECRET for the private worker bridge before enabling hosted AI Designer runs.",
        },
        { status: 503 },
      );
    }

    const auth = await authorizeProjectRequest(request, projectId, "edit");
    if ("response" in auth) {
      return auth.response;
    }

    const body = (await request.json().catch(() => ({}))) as GenerationRunBody;
    const queuedRun = createGenerationRun({
      progress: [
        queueForWorker
          ? "generation queued for private local AI worker"
          : "generation queued",
      ],
      status: "queued",
    });
    failureRunId = queuedRun.id;
    const startedProject = await updateProject(
      projectId,
      (current) => {
        return upsertGenerationRun(
          {
            ...current,
            generationQuestionnaire: {
              ...(current.generationQuestionnaire ?? {}),
              ...(body.questionnaire ?? {}),
            },
          },
          queuedRun,
        );
      },
      {
        expectedRevision: body.expectedRevision,
      },
    );

    if (!startedProject) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    if (queueForWorker) {
      return NextResponse.json(
        {
          message: "AI book generation queued for the private local worker.",
          project: await hydrateProjectForClient(startedProject, getRequestOrigin(request)),
          run: sanitizeGenerationRunForClient(
            startedProject.generationRuns?.find((entry) => entry.id === queuedRun.id) ??
              queuedRun,
          ),
        },
        { status: 202 },
      );
    }

    const persistRun = async (run: GenerationRun) => {
      await updateProject(
        projectId,
        (current) => upsertGenerationRun(current, run),
        {
          skipRevisionAdvance: true,
        },
      );
    };

    let latestRun = queuedRun;
    const result = await generateProjectBookWithLocalAi(startedProject, {
      onRunUpdate: async (run) => {
        latestRun = run;
        await persistRun(run);
      },
      questionnaire: body.questionnaire,
      runId: queuedRun.id,
    });
    latestRun = result.run;

    const project = await updateProject(
      projectId,
      () => result.project,
      {
        expectedRevision: startedProject.revision,
        activity: {
          actorEmail: auth.user.email,
          actorId: auth.user.id,
          message: `${auth.user.name} generated an AI-designed book draft.`,
          type: "draft_ai_generated",
        },
      },
    );

    if (!project) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    const run = project.generationRuns?.find((entry) => entry.id === latestRun.id) ??
      project.generationRuns?.[0];

    return NextResponse.json({
      message: "AI book draft generated.",
      project: await hydrateProjectForClient(project, getRequestOrigin(request)),
      run: run ? sanitizeGenerationRunForClient(run) : run,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI book generation failed.";

    if (failureProjectId && failureRunId) {
      await updateProject(
        failureProjectId,
        (current) => markGenerationRunFailed(current, failureRunId!, message),
        {
          skipRevisionAdvance: true,
        },
      ).catch(() => {
        // The original error is more useful to return than a secondary failure-write error.
      });
    }

    if (isRevisionConflictError(error)) {
      return mutationErrorResponse(error, "Unable to generate this AI draft.");
    }

    return NextResponse.json(
      { message },
      {
        status: /ollama|local ai|model|fetch failed|timeout/i.test(message) ? 503 : 500,
      },
    );
  }
}
