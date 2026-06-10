import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import path from "node:path";

type UploadTicket = {
  contentType: string;
  downloadUrl: string;
  expiresInSeconds: number;
  storagePath: string;
  uploadUrl: string;
};

const uploadExpirySeconds = 60 * 15;
const downloadExpirySeconds = 60 * 60 * 24 * 7;

let cachedClient: S3Client | null | undefined;

function sanitizeFileName(fileName: string) {
  const normalized = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || `photo-${Date.now()}.jpg`;
}

function getBucketName() {
  return process.env.PHOTO_STORAGE_BUCKET ?? null;
}

function getPublicBaseUrl() {
  const value = process.env.PHOTO_STORAGE_PUBLIC_BASE_URL;
  return value ? value.replace(/\/$/, "") : null;
}

export function isLocalObjectStorageEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.PHOTO_STORAGE_DISABLE_LOCAL !== "true";
}

export function isLocalUploadStoragePath(storagePath: string) {
  return storagePath.startsWith("local-uploads/");
}

function getLocalUploadBaseUrl() {
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    "http://localhost:3000/api";

  return apiBaseUrl.replace(/\/api\/?$/, "").replace(/\/$/, "");
}

function isConnectableLocalOrigin(origin: string) {
  try {
    const { hostname } = new URL(origin);

    return hostname !== "0.0.0.0" && hostname !== "::" && hostname !== "[::]";
  } catch {
    return false;
  }
}

function getLocalUploadOrigin(origin?: string) {
  if (origin && isConnectableLocalOrigin(origin)) {
    return origin.replace(/\/$/, "");
  }

  return getLocalUploadBaseUrl();
}

function getLocalUploadUrl(storagePath: string, origin?: string) {
  return `${getLocalUploadOrigin(origin)}/api/local-uploads/${storagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function getLocalUploadFilePath(storagePath: string) {
  if (!isLocalUploadStoragePath(storagePath)) {
    throw new Error("Invalid local upload storage path.");
  }

  const safeSegments = storagePath
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/[^a-zA-Z0-9._-]/g, "-"));

  const dataDirectory = process.env.PHOTO_BOOK_FILE_STORE_DIR
    ? path.resolve(process.env.PHOTO_BOOK_FILE_STORE_DIR)
    : path.join(process.cwd(), "data");

  return path.join(dataDirectory, ...safeSegments);
}

function getS3Client() {
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  const endpoint = process.env.PHOTO_STORAGE_ENDPOINT;
  const accessKeyId = process.env.PHOTO_STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.PHOTO_STORAGE_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey || !getBucketName()) {
    cachedClient = null;
    return cachedClient;
  }

  cachedClient = new S3Client({
    region: process.env.PHOTO_STORAGE_REGION ?? "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: process.env.PHOTO_STORAGE_FORCE_PATH_STYLE === "true",
  });

  return cachedClient;
}

export function isObjectStorageConfigured() {
  return Boolean(getS3Client() && getBucketName());
}

export async function signObjectReadUrl(
  storagePath: string,
  expiresInSeconds = downloadExpirySeconds,
  origin?: string,
) {
  if (isLocalObjectStorageEnabled() && isLocalUploadStoragePath(storagePath)) {
    return getLocalUploadUrl(storagePath, origin);
  }

  const bucket = getBucketName();
  const client = getS3Client();

  if (!bucket || !client) {
    return null;
  }

  const publicBaseUrl = getPublicBaseUrl();
  if (publicBaseUrl) {
    return `${publicBaseUrl}/${storagePath}`;
  }

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: storagePath,
    }),
    { expiresIn: expiresInSeconds },
  );
}

export async function createPhotoUploadTicket(input: {
  contentType: string;
  fileName: string;
  origin?: string;
  projectId: string;
}) {
  const bucket = getBucketName();
  const client = getS3Client();

  if (!bucket || !client) {
    if (!isLocalObjectStorageEnabled()) {
      throw new Error(
        "Object storage is not configured. Add PHOTO_STORAGE_* environment variables.",
      );
    }

    const storagePath = [
      "local-uploads",
      input.projectId,
      `${Date.now()}-${randomUUID()}-${sanitizeFileName(input.fileName)}`,
    ].join("/");
    const localUploadOrigin = getLocalUploadOrigin(input.origin);
    const localUrl = `${localUploadOrigin}/api/local-uploads/${storagePath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")}`;

    return {
      uploadUrl: localUrl,
      downloadUrl: localUrl,
      storagePath,
      contentType: input.contentType,
      expiresInSeconds: uploadExpirySeconds,
    } satisfies UploadTicket;
  }

  const storagePath = [
    "projects",
    input.projectId,
    `${Date.now()}-${randomUUID()}-${sanitizeFileName(input.fileName)}`,
  ].join("/");

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: storagePath,
      ContentType: input.contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
    { expiresIn: uploadExpirySeconds },
  );
  const downloadUrl = await signObjectReadUrl(storagePath);

  if (!downloadUrl) {
    throw new Error("Failed to create a signed download URL for the uploaded photo.");
  }

  return {
    uploadUrl,
    downloadUrl,
    storagePath,
    contentType: input.contentType,
    expiresInSeconds: uploadExpirySeconds,
  } satisfies UploadTicket;
}
