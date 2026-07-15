import { normalizeProjectRecord, type Project } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import {
  authorizeAiWorkerRequest,
  hashAiWorkerJobProject,
  isAiWorkerJobSignatureValid,
  isAiWorkerLeaseTokenValid,
} from "@/lib/server/ai-worker-auth";
import { generateProjectBookWithLocalAi } from "@/lib/server/book-generation-ai";

type ProcessBody = {
  expectedRevision?: number;
  jobSignature?: string;
  project?: Project;
  projectDigest?: string;
  runId?: string;
  workerId?: string;
  workerLeaseToken?: string;
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
    if (
      !body.project ||
      !body.runId ||
      typeof body.expectedRevision !== "number" ||
      !Number.isFinite(body.expectedRevision) ||
      !body.projectDigest ||
      !body.workerId ||
      !body.workerLeaseToken ||
      !body.jobSignature
    ) {
      return NextResponse.json(
        {
          message:
            "project, runId, expectedRevision, projectDigest, workerId, workerLeaseToken, and jobSignature are required.",
        },
        { status: 400 },
      );
    }

    const actualProjectDigest = hashAiWorkerJobProject(body.project);
    if (actualProjectDigest !== body.projectDigest) {
      return NextResponse.json(
        { message: "AI worker project digest did not match the signed job payload." },
        { status: 409 },
      );
    }

    const project = normalizeProjectRecord(body.project);
    const run = project.generationRuns?.find((entry) => entry.id === body.runId);
    if (!run || run.workerId !== body.workerId) {
      return NextResponse.json(
        { message: "AI worker job is no longer claimed by this worker." },
        { status: 409 },
      );
    }

    if (
      !run.workerLeaseTokenHash ||
      !isAiWorkerLeaseTokenValid(run.workerLeaseTokenHash, body.workerLeaseToken)
    ) {
      return NextResponse.json(
        { message: "AI worker lease token did not match the claimed job." },
        { status: 409 },
      );
    }

    const validSignature = isAiWorkerJobSignatureValid(
      {
        expectedRevision: body.expectedRevision,
        projectDigest: body.projectDigest,
        projectId: project.id,
        runId: body.runId,
        workerId: body.workerId,
        workerLeaseToken: body.workerLeaseToken,
      },
      body.jobSignature,
    );
    if (!validSignature) {
      return NextResponse.json(
        { message: "AI worker signed job payload was invalid." },
        { status: 401 },
      );
    }

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
