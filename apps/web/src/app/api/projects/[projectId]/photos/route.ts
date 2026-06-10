import { addPhotosToProject, summarizePhotoImport } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { authorizeProjectRequest } from "@/lib/server/auth";
import { mutationErrorResponse } from "@/lib/server/mutation-response";
import { updateProject } from "@/lib/server/project-store";
import { hydrateProjectForClient } from "@/lib/server/project-response";
import { getRequestOrigin } from "@/lib/server/request-origin";

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
    const body = await request.json();
    const photos = Array.isArray(body.photos) ? body.photos : [];
    const photoImport = summarizePhotoImport(auth.project, photos);

    if (photoImport.addedCount === 0) {
      return NextResponse.json({
        photoImport,
        project: await hydrateProjectForClient(auth.project, getRequestOrigin(request)),
      });
    }

    const project = await updateProject(
      projectId,
      (current) => addPhotosToProject(current, photos),
      {
        expectedRevision: body.expectedRevision,
        activity: {
          actorEmail: auth.user.email,
          actorId: auth.user.id,
          message: photoImport.skippedDuplicateCount
            ? `${auth.user.name} uploaded ${photoImport.addedCount} new photo${photoImport.addedCount === 1 ? "" : "s"}; ${photoImport.skippedDuplicateCount} duplicate${photoImport.skippedDuplicateCount === 1 ? "" : "s"} skipped.`
            : `${auth.user.name} uploaded ${photoImport.addedCount} photo${photoImport.addedCount === 1 ? "" : "s"}.`,
          metadata: {
            attemptedPhotoCount: photoImport.attemptedCount,
            photoCount: photoImport.addedCount,
            skippedDuplicateCount: photoImport.skippedDuplicateCount,
          },
          type: "photos_uploaded",
        },
      },
    );

    if (!project) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    return NextResponse.json({
      photoImport,
      project: await hydrateProjectForClient(project, getRequestOrigin(request)),
    });
  } catch (error) {
    return mutationErrorResponse(error, "Unable to add photos to this project.");
  }
}
