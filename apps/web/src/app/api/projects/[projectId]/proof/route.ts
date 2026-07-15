import { buildProofHtml, type ProofExportRequest } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { authorizeProjectRequest } from "@/lib/server/auth";
import { mutationErrorResponse } from "@/lib/server/mutation-response";
import { updateProject } from "@/lib/server/project-store";
import { hydrateProjectForClient } from "@/lib/server/project-response";
import { getRequestOrigin } from "@/lib/server/request-origin";

function getProofRequest(projectId: string, request: Request): ProofExportRequest {
  const url = new URL(request.url);

  return {
    draftId: url.searchParams.get("draft") ?? undefined,
    exportedAt: new Date().toISOString(),
    includeBleedGuides: url.searchParams.get("bleed") === "1",
    includePrintSafeGuides: url.searchParams.get("safe") !== "0",
    projectId,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const auth = await authorizeProjectRequest(request, projectId, "view");
  if ("response" in auth) {
    return auth.response;
  }

  const proofRequest = getProofRequest(projectId, request);
  const project = await hydrateProjectForClient(auth.project, getRequestOrigin(request));

  return NextResponse.json({
    html: buildProofHtml(project, proofRequest),
    proofRequest,
    projectId,
    revision: project.revision ?? 1,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const auth = await authorizeProjectRequest(request, projectId, "edit");
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Partial<
      ProofExportRequest & { expectedRevision?: number }
    >;
    const proofRequest: ProofExportRequest = {
      draftId: body.draftId,
      exportedAt: new Date().toISOString(),
      includeBleedGuides: body.includeBleedGuides ?? true,
      includePrintSafeGuides: body.includePrintSafeGuides ?? true,
      projectId,
      requestedByEmail: auth.user.email,
    };
    const project = await updateProject(
      projectId,
      (current) => current,
      {
        expectedRevision: body.expectedRevision,
        activity: {
          actorEmail: auth.user.email,
          actorId: auth.user.id,
          message: `${auth.user.name} exported a print-review proof.`,
          type: "proof_exported",
        },
      },
    );

    if (!project) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }
    const hydratedProject = await hydrateProjectForClient(project, getRequestOrigin(request));

    return NextResponse.json({
      html: buildProofHtml(hydratedProject, proofRequest),
      project: hydratedProject,
      proofRequest,
    });
  } catch (error) {
    return mutationErrorResponse(error, "Unable to prepare this proof export.");
  }
}
