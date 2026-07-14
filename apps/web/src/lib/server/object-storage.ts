import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { isUnsignedObjectReadDenied } from "@/lib/alpha-readiness-contract";

type UploadTicket = {
  contentType: string;
  downloadUrl: string;
  expiresInSeconds: number;
  storagePath: string;
  uploadUrl: string;
};

export const SUPPORTED_PHOTO_UPLOAD_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

const uploadExpirySeconds = 60 * 15;
const downloadExpirySeconds = 60 * 60 * 24 * 7;
const maxUploadFileNameLength = 180;
const uploadFileExtensionsByContentType = {
  "image/heic": "heic",
  "image/heif": "heif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} satisfies Record<(typeof SUPPORTED_PHOTO_UPLOAD_CONTENT_TYPES)[number], string>;
const uploadFileExtensionAliasesByContentType = {
  "image/heic": ["heic"],
  "image/heif": ["heif"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
} satisfies Record<(typeof SUPPORTED_PHOTO_UPLOAD_CONTENT_TYPES)[number], string[]>;

let cachedClient: S3Client | null | undefined;

export function normalizePhotoUploadContentType(contentType: string) {
  return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function getPhotoUploadInputError(input: {
  contentType?: string;
  fileName?: string;
}) {
  const fileName = input.fileName?.trim() ?? "";
  const contentType = normalizePhotoUploadContentType(input.contentType ?? "");

  if (!fileName || !contentType) {
    return "fileName and contentType are required.";
  }

  if (fileName.length > maxUploadFileNameLength) {
    return `fileName must be ${maxUploadFileNameLength} characters or fewer.`;
  }

  if (!SUPPORTED_PHOTO_UPLOAD_CONTENT_TYPES.includes(
    contentType as (typeof SUPPORTED_PHOTO_UPLOAD_CONTENT_TYPES)[number],
  )) {
    return `Unsupported photo type. Upload JPEG, PNG, WebP, HEIC, or HEIF photos.`;
  }

  return null;
}

export function getPhotoUploadBytesError(input: {
  bytes: Buffer;
  contentType?: string;
}) {
  const contentType = normalizePhotoUploadContentType(input.contentType ?? "");
  const bytes = input.bytes;

  if (!SUPPORTED_PHOTO_UPLOAD_CONTENT_TYPES.includes(
    contentType as (typeof SUPPORTED_PHOTO_UPLOAD_CONTENT_TYPES)[number],
  )) {
    return "Unsupported photo type. Upload JPEG, PNG, WebP, HEIC, or HEIF photos.";
  }

  if (!bytes.length) {
    return "The uploaded photo is empty.";
  }

  if (contentType === "image/jpeg") {
    return bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
      ? null
      : "The uploaded file is not a valid JPEG photo.";
  }

  if (contentType === "image/png") {
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return pngSignature.every((byte, index) => bytes[index] === byte)
      ? null
      : "The uploaded file is not a valid PNG photo.";
  }

  if (contentType === "image/webp") {
    return bytes.length >= 12 &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
      ? null
      : "The uploaded file is not a valid WebP photo.";
  }

  const isHeifContainer =
    bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp";
  const heifBrands = bytes.subarray(8, Math.min(bytes.length, 40)).toString("ascii");
  const hasSupportedHeifBrand = /\b(?:heic|heix|hevc|hevx|heif|mif1|msf1)\b/.test(
    heifBrands,
  );

  return isHeifContainer && hasSupportedHeifBrand
    ? null
    : "The uploaded file is not a valid HEIC or HEIF photo.";
}

function sanitizeFileName(fileName: string) {
  const normalized = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || `photo-${Date.now()}.jpg`;
}

function withContentTypeExtension(fileName: string, contentType: string) {
  const normalizedContentType = normalizePhotoUploadContentType(contentType);
  const sanitized = sanitizeFileName(fileName);
  const knownContentType =
    normalizedContentType as (typeof SUPPORTED_PHOTO_UPLOAD_CONTENT_TYPES)[number];
  const expectedExtension = uploadFileExtensionsByContentType[knownContentType];
  const acceptedExtensions = uploadFileExtensionAliasesByContentType[knownContentType] ?? [];

  if (!expectedExtension) {
    return sanitized;
  }

  const extension = path.extname(sanitized).replace(/^\./, "").toLowerCase();
  if (acceptedExtensions.includes(extension)) {
    return sanitized;
  }

  const baseName = sanitized.replace(/\.[^.]+$/, "") || `photo-${Date.now()}`;
  return `${baseName}.${expectedExtension}`;
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

export function isPublicObjectStorageConfigured() {
  return Boolean(getPublicBaseUrl());
}

function commaSeparatedHeaderIncludes(value: string | null, expected: string) {
  return (
    value
      ?.split(",")
      .map((entry) => entry.trim().toLowerCase())
      .includes(expected.toLowerCase()) ?? false
  );
}

export async function verifyObjectStorageBrowserCors(input: {
  origin: string;
  uploadUrl: string;
}) {
  const origin = new URL(input.origin).origin;
  const response = await fetch(input.uploadUrl, {
    headers: {
      "Access-Control-Request-Headers": "content-type",
      "Access-Control-Request-Method": "PUT",
      Origin: origin,
    },
    method: "OPTIONS",
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  const allowedOrigin = response.headers.get("access-control-allow-origin");
  const exactOriginAllowed = allowedOrigin === origin;
  const wildcardOriginConfigured = allowedOrigin === "*";
  const putAllowed = commaSeparatedHeaderIncludes(
    response.headers.get("access-control-allow-methods"),
    "PUT",
  );
  const contentTypeAllowed = commaSeparatedHeaderIncludes(
    response.headers.get("access-control-allow-headers"),
    "content-type",
  );

  return {
    allowed: response.ok && exactOriginAllowed && putAllowed && contentTypeAllowed,
    contentTypeAllowed,
    exactOriginAllowed,
    preflightStatus: response.status,
    putAllowed,
    wildcardOriginConfigured,
  };
}

export async function readStoredObjectBuffer(storagePath: string) {
  if (isLocalObjectStorageEnabled() && isLocalUploadStoragePath(storagePath)) {
    return readFile(getLocalUploadFilePath(storagePath));
  }

  const bucket = getBucketName();
  const client = getS3Client();

  if (!bucket || !client) {
    return null;
  }

  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: storagePath,
    }),
  );
  const body = response.Body;

  if (!body) {
    return null;
  }

  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }

  return null;
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

export async function verifyObjectStorageRoundTrip() {
  const bucket = getBucketName();
  const client = getS3Client();

  if (!bucket || !client) {
    throw new Error("Object storage is not configured.");
  }

  const storagePath = `readiness/${Date.now()}-${randomUUID()}.txt`;
  const expected = Buffer.from("photo-book-maker-object-storage-readiness-v1", "utf8");
  let objectCreated = false;

  try {
    await client.send(
      new PutObjectCommand({
        Body: expected,
        Bucket: bucket,
        CacheControl: "no-store",
        ContentType: "text/plain; charset=utf-8",
        Key: storagePath,
      }),
    );
    objectCreated = true;

    const sdkReceived = await readStoredObjectBuffer(storagePath);
    if (!sdkReceived || !sdkReceived.equals(expected)) {
      throw new Error("Object storage readiness canary did not read back the bytes it wrote.");
    }

    const signedReadUrl = await signObjectReadUrl(storagePath, 60);
    if (!signedReadUrl) {
      throw new Error("Object storage readiness canary could not mint a signed read URL.");
    }

    const signedReadResponse = await fetch(signedReadUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    const signedReadBytes = Buffer.from(await signedReadResponse.arrayBuffer());
    if (!signedReadResponse.ok || !signedReadBytes.equals(expected)) {
      throw new Error("Object storage signed-read canary did not return the bytes it wrote.");
    }

    const unsignedReadUrl = new URL(signedReadUrl);
    unsignedReadUrl.search = "";
    const unsignedReadResponse = await fetch(unsignedReadUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    const unsignedReadExplicitlyDenied = isUnsignedObjectReadDenied(unsignedReadResponse.status);
    const privateSignedReads =
      !isPublicObjectStorageConfigured() && unsignedReadExplicitlyDenied;
    await unsignedReadResponse.body?.cancel();

    return {
      bytesVerified: sdkReceived.length,
      privateSignedReads,
      signedReadBytesVerified: signedReadBytes.length,
      storagePathPrefix: "readiness",
      unsignedReadExplicitlyDenied,
      unsignedReadStatus: unsignedReadResponse.status,
    };
  } finally {
    if (objectCreated) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: storagePath,
        }),
      );
    }
  }
}

export async function createPhotoUploadTicket(input: {
  contentType: string;
  fileName: string;
  origin?: string;
  projectId: string;
}) {
  const validationError = getPhotoUploadInputError(input);
  if (validationError) {
    throw new Error(validationError);
  }

  const contentType = normalizePhotoUploadContentType(input.contentType);
  const fileName = withContentTypeExtension(input.fileName, contentType);
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
      `${Date.now()}-${randomUUID()}-${fileName}`,
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
      contentType,
      expiresInSeconds: uploadExpirySeconds,
    } satisfies UploadTicket;
  }

  const storagePath = [
    "projects",
    input.projectId,
    `${Date.now()}-${randomUUID()}-${fileName}`,
  ].join("/");

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: storagePath,
      ContentType: contentType,
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
    contentType,
    expiresInSeconds: uploadExpirySeconds,
  } satisfies UploadTicket;
}
