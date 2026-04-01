import type {
  AddLocalPhotoInput,
  AddProjectNoteInput,
  CreateProjectInput,
  Project,
} from "./core";
import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";
import { getAccessToken } from "./supabase";

function normalizeBaseUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.replace(/\/$/, "");
}

function deriveBaseUrlFromBundleHost() {
  const scriptUrl = NativeModules.SourceCode?.scriptURL;
  if (typeof scriptUrl !== "string") {
    return null;
  }

  const match = scriptUrl.match(/^https?:\/\/([^/:]+)(?::\d+)?/i);
  if (!match?.[1]) {
    return null;
  }

  const host = match[1] === "localhost" && Platform.OS === "android"
    ? "10.0.2.2"
    : match[1];

  return `http://${host}:3000/api`;
}

function getConfiguredBaseUrl() {
  return normalizeBaseUrl(
    process.env.EXPO_PUBLIC_API_BASE_URL ??
      deriveBaseUrlFromBundleHost() ??
      Constants.expoConfig?.extra?.apiBaseUrl ??
      null,
  );
}

export function getResolvedApiBaseUrl() {
  return getConfiguredBaseUrl();
}

export function getResolvedWebBaseUrl() {
  const baseUrl = getConfiguredBaseUrl();
  if (!baseUrl) {
    return null;
  }

  return baseUrl.replace(/\/api$/, "");
}

export function getProjectWebUrl(projectId: string) {
  const webBaseUrl = getResolvedWebBaseUrl();
  return webBaseUrl ? `${webBaseUrl}/projects/${projectId}` : null;
}

export function getProjectWebEditorUrl(projectId: string) {
  const webBaseUrl = getResolvedWebBaseUrl();
  return webBaseUrl ? `${webBaseUrl}/projects/${projectId}/editor` : null;
}

export function getProjectWebPreviewUrl(projectId: string) {
  const webBaseUrl = getResolvedWebBaseUrl();
  return webBaseUrl ? `${webBaseUrl}/projects/${projectId}/preview` : null;
}

function getBaseUrl() {
  return getConfiguredBaseUrl();
}

async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return null;
  }

  const accessToken = await getAccessToken();

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

type RemotePhotoUploadTicket = {
  contentType: string;
  downloadUrl: string;
  expiresInSeconds: number;
  storagePath: string;
  uploadUrl: string;
};

export function hasRemoteApi() {
  return Boolean(getBaseUrl());
}

export async function fetchProjectsRemote() {
  const data = await request<{ projects: Project[] }>("/projects");
  return data?.projects ?? null;
}

export async function createProjectRemote(input: CreateProjectInput) {
  const data = await request<{ project: Project }>("/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data?.project ?? null;
}

export async function inviteCollaboratorRemote(
  projectId: string,
  input: { email: string; name: string },
) {
  const data = await request<{ project: Project }>(
    `/projects/${projectId}/collaborators`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return data?.project ?? null;
}

export async function resolveTaskRemote(
  projectId: string,
  taskId: string,
  input?: { locationLabel?: string },
) {
  const data = await request<{ project: Project }>(
    `/projects/${projectId}/tasks/${taskId}/resolve`,
    {
      method: "POST",
      body: JSON.stringify({
        status: "resolved",
        ...(input?.locationLabel?.trim()
          ? { locationLabel: input.locationLabel.trim() }
          : {}),
      }),
    },
  );
  return data?.project ?? null;
}

export async function togglePageApprovalRemote(projectId: string, pageId: string) {
  const data = await request<{ project: Project }>(
    `/projects/${projectId}/pages/${pageId}/approval`,
    {
      method: "POST",
    },
  );
  return data?.project ?? null;
}

export async function updatePageCopyRemote(
  projectId: string,
  pageId: string,
  input: { title: string; caption: string; confirmed?: boolean },
) {
  const data = await request<{ project: Project }>(
    `/projects/${projectId}/pages/${pageId}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
  return data?.project ?? null;
}

export async function toggleMustIncludeRemote(projectId: string, photoId: string) {
  const data = await request<{ project: Project }>(
    `/projects/${projectId}/photos/${photoId}/must-include`,
    {
      method: "POST",
    },
  );
  return data?.project ?? null;
}

export async function addNoteRemote(projectId: string, input: AddProjectNoteInput) {
  const data = await request<{ project: Project }>(`/projects/${projectId}/notes`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data?.project ?? null;
}

export async function addPhotosRemote(projectId: string, photos: AddLocalPhotoInput[]) {
  const data = await request<{ project: Project }>(`/projects/${projectId}/photos`, {
    method: "POST",
    body: JSON.stringify({ photos }),
  });
  return data?.project ?? null;
}

export async function createPhotoUploadTicketRemote(
  projectId: string,
  input: { contentType: string; fileName: string },
) {
  const data = await request<{ upload: RemotePhotoUploadTicket }>(
    `/projects/${projectId}/uploads`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

  return data?.upload ?? null;
}

export async function uploadFileToRemoteStorage(
  upload: RemotePhotoUploadTicket,
  localUri: string,
) {
  const fileResponse = await fetch(localUri);
  const blob = await fileResponse.blob();
  const uploadResponse = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": upload.contentType,
    },
    body: blob,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Remote storage upload failed: ${uploadResponse.status}`);
  }

  return {
    downloadUrl: upload.downloadUrl,
    mimeType: upload.contentType,
    storagePath: upload.storagePath,
  };
}

export async function setThemeRemote(projectId: string, selectedThemeId: string) {
  const data = await request<{ project: Project }>(`/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify({ selectedThemeId }),
  });
  return data?.project ?? null;
}

export async function advancePrintOrderRemote(projectId: string) {
  const data = await request<{ project: Project }>(
    `/projects/${projectId}/print-order`,
    {
      method: "POST",
    },
  );
  return data?.project ?? null;
}

export async function finalizeProjectRemote(projectId: string) {
  const data = await request<{ project: Project }>(`/projects/${projectId}/finalize`, {
    method: "POST",
  });
  return data?.project ?? null;
}
