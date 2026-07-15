import { addPhotosToProject, summarizePhotoImport } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { authorizeProjectRequest } from "@/lib/server/auth";
import { mutationErrorResponse } from "@/lib/server/mutation-response";
import {
  SUPPORTED_PHOTO_UPLOAD_CONTENT_TYPES,
  isLocalObjectStorageEnabled,
  normalizePhotoUploadContentType,
} from "@/lib/server/object-storage";
import { updateProject } from "@/lib/server/project-store";
import { hydrateProjectForClient } from "@/lib/server/project-response";
import { getRequestOrigin } from "@/lib/server/request-origin";

const maxPhotoImportBatchSize = 250;
const maxPhotoTitleLength = 220;
const maxPhotoDimensionPixels = 80_000;

function isProjectOwnedStoragePath(projectId: string, storagePath: string) {
  return (
    storagePath.startsWith(`projects/${projectId}/`) ||
    (isLocalObjectStorageEnabled() && storagePath.startsWith(`local-uploads/${projectId}/`))
  );
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getPhotoImportValidationError(projectId: string, photos: unknown[]) {
  if (!photos.length) {
    return "Choose at least one uploaded photo to add to the book.";
  }

  if (photos.length > maxPhotoImportBatchSize) {
    return `Add ${maxPhotoImportBatchSize} photos or fewer per batch.`;
  }

  for (const [index, photo] of photos.entries()) {
    if (!photo || typeof photo !== "object") {
      return `Photo ${index + 1} is missing required upload details.`;
    }

    const entry = photo as {
      height?: unknown;
      mimeType?: unknown;
      storagePath?: unknown;
      title?: unknown;
      uri?: unknown;
      width?: unknown;
    };
    const storagePath = typeof entry.storagePath === "string" ? entry.storagePath.trim() : "";
    const uri = typeof entry.uri === "string" ? entry.uri.trim() : "";
    const mimeType =
      typeof entry.mimeType === "string" ? normalizePhotoUploadContentType(entry.mimeType) : "";
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    const width = typeof entry.width === "number" ? entry.width : Number.NaN;
    const height = typeof entry.height === "number" ? entry.height : Number.NaN;

    if (!storagePath || !isProjectOwnedStoragePath(projectId, storagePath)) {
      return "Use the app upload flow before adding photos to this book.";
    }

    if (!uri || !isHttpUrl(uri)) {
      return "Uploaded photos must include a signed read URL.";
    }

    if (!SUPPORTED_PHOTO_UPLOAD_CONTENT_TYPES.includes(
      mimeType as (typeof SUPPORTED_PHOTO_UPLOAD_CONTENT_TYPES)[number],
    )) {
      return "Uploaded photos must be JPEG, PNG, WebP, HEIC, or HEIF.";
    }

    if (!title || title.length > maxPhotoTitleLength) {
      return `Photo titles must be between 1 and ${maxPhotoTitleLength} characters.`;
    }

    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0 ||
      width > maxPhotoDimensionPixels ||
      height > maxPhotoDimensionPixels
    ) {
      return "Uploaded photos must include valid image dimensions.";
    }
  }

  return null;
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
    const body = await request.json();
    const photos = Array.isArray(body.photos) ? body.photos : [];
    const validationError = getPhotoImportValidationError(projectId, photos);

    if (validationError) {
      return NextResponse.json({ message: validationError }, { status: 400 });
    }

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
