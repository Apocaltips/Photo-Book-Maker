import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  getLocalUploadFilePath,
  isLocalObjectStorageEnabled,
} from "@/lib/server/object-storage";

function getStoragePath(segments: string[]) {
  return segments.map((segment) => decodeURIComponent(segment)).join("/");
}

function getContentType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();

  if ([".jpg", ".jpeg"].includes(extension)) {
    return "image/jpeg";
  }

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  return "application/octet-stream";
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (!isLocalObjectStorageEnabled()) {
    return NextResponse.json({ message: "Local uploads are disabled." }, { status: 404 });
  }

  const { path: pathSegments } = await params;
  const storagePath = getStoragePath(pathSegments);
  const filePath = getLocalUploadFilePath(storagePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(await request.arrayBuffer()));

  return NextResponse.json({ ok: true, storagePath });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (!isLocalObjectStorageEnabled()) {
    return NextResponse.json({ message: "Local uploads are disabled." }, { status: 404 });
  }

  const { path: pathSegments } = await params;
  const storagePath = getStoragePath(pathSegments);
  const filePath = getLocalUploadFilePath(storagePath);
  const file = await readFile(filePath);

  return new Response(file, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": getContentType(filePath),
    },
  });
}
