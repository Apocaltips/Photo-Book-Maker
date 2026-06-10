import type { BookGenerationQuestionnaireAnswers } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { authorizeProjectRequest } from "@/lib/server/auth";
import { generateProjectBookWithLocalAi } from "@/lib/server/book-generation-ai";
import { mutationErrorResponse } from "@/lib/server/mutation-response";
import { hydrateProjectForClient } from "@/lib/server/project-response";
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
  try {
    const { projectId } = await params;
    const auth = await authorizeProjectRequest(request, projectId, "edit");
    if ("response" in auth) {
      return auth.response;
    }

    const body = (await request.json().catch(() => ({}))) as GenerationRunBody;
    let latestRunId: string | undefined;
    const project = await updateProject(
      projectId,
      async (current) => {
        const result = await generateProjectBookWithLocalAi(current, {
          questionnaire: body.questionnaire,
        });
        latestRunId = result.run.id;
        return result.project;
      },
      {
        expectedRevision: body.expectedRevision,
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

    const run = latestRunId
      ? project.generationRuns?.find((entry) => entry.id === latestRunId)
      : project.generationRuns?.[0];

    return NextResponse.json({
      message: "AI book draft generated.",
      project: await hydrateProjectForClient(project, getRequestOrigin(request)),
      run,
    });
  } catch (error) {
    if (isRevisionConflictError(error)) {
      return mutationErrorResponse(error, "Unable to generate this AI draft.");
    }

    const message =
      error instanceof Error ? error.message : "AI book generation failed.";
    return NextResponse.json(
      { message },
      {
        status: /ollama|local ai|model|fetch failed|timeout/i.test(message) ? 503 : 500,
      },
    );
  }
}
