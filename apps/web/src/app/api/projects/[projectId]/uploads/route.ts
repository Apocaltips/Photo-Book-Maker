import { NextResponse } from "next/server";
import { authorizeProjectRequest } from "@/lib/server/auth";
import {
  createPhotoUploadTicket,
  getPhotoUploadInputError,
  isLocalObjectStorageEnabled,
  isObjectStorageConfigured,
} from "@/lib/server/object-storage";
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
  const body = (await request.json()) as {
    contentType?: string;
    fileName?: string;
  };

  if (!isObjectStorageConfigured() && !isLocalObjectStorageEnabled()) {
    return NextResponse.json(
      {
        message:
          "Remote object storage is not configured. Add PHOTO_STORAGE_* environment variables.",
      },
      { status: 503 },
    );
  }

  const inputError = getPhotoUploadInputError(body);
  if (inputError) {
    return NextResponse.json(
      { message: inputError },
      { status: 400 },
    );
  }
  const fileName = body.fileName ?? "";
  const contentType = body.contentType ?? "";

  const upload = await createPhotoUploadTicket({
    projectId,
    fileName,
    contentType,
    origin: getRequestOrigin(request),
  });

  return NextResponse.json({ upload });
}
