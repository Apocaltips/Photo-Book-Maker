import { NextResponse } from "next/server";
import { createPhotoUploadTicket, isObjectStorageConfigured } from "@/lib/server/object-storage";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const body = (await request.json()) as {
    contentType?: string;
    fileName?: string;
  };

  if (!isObjectStorageConfigured()) {
    return NextResponse.json(
      {
        message:
          "Remote object storage is not configured. Add PHOTO_STORAGE_* environment variables.",
      },
      { status: 503 },
    );
  }

  if (!body.fileName || !body.contentType) {
    return NextResponse.json(
      { message: "fileName and contentType are required." },
      { status: 400 },
    );
  }

  const upload = await createPhotoUploadTicket({
    projectId,
    fileName: body.fileName,
    contentType: body.contentType,
  });

  return NextResponse.json({ upload });
}
