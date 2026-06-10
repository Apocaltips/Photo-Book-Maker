import { normalizeProjectRecord, type Project } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { authorizeAiWorkerRequest } from "@/lib/server/ai-worker-auth";
import { generateProjectBookWithLocalAi } from "@/lib/server/book-generation-ai";

type ProcessBody = {
  project?: Project;
  runId?: string;
};

export async function POST(request: Request) {
  const unauthorized = authorizeAiWorkerRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  if (
    process.env.NODE_ENV === "production" &&
    process.env.LOCAL_AI_PROCESSOR_IN_PRODUCTION !== "1"
  ) {
    return NextResponse.json(
      {
        message:
          "Local AI processing is disabled in production. Run this endpoint on the private worker machine.",
      },
      { status: 404 },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as ProcessBody;
    if (!body.project || !body.runId) {
      return NextResponse.json(
        { message: "project and runId are required." },
        { status: 400 },
      );
    }

    const project = normalizeProjectRecord(body.project);
    const result = await generateProjectBookWithLocalAi(project, {
      questionnaire: project.generationQuestionnaire,
      runId: body.runId,
    });

    return NextResponse.json({
      project: result.project,
      run: result.run,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Local AI processing failed." },
      { status: 500 },
    );
  }
}
