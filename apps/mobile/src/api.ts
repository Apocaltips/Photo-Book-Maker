import type {
  AddLocalPhotoInput,
  AddProjectNoteInput,
  BookDraftEditorState,
  BookGenerationQuestionnaire,
  BookGenerationQuestionnaireAnswers,
  CreateProjectInput,
  GenerationRun,
  Project,
} from "@photo-book-maker/core";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
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

export function getProjectWebProofUrl(projectId: string) {
  const webBaseUrl = getResolvedWebBaseUrl();
  return webBaseUrl ? `${webBaseUrl}/projects/${projectId}/proof` : null;
}

function getBaseUrl() {
  return getConfiguredBaseUrl();
}

const devAuthHeaders = {
  "X-Photo-Book-Dev-Email": "android-tester@example.com",
  "X-Photo-Book-Dev-Id": "android-tester",
  "X-Photo-Book-Dev-Name": "Android Tester",
};

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
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : devAuthHeaders),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `API request failed: ${response.status}`;

    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) {
        message = body.message;
      }
    } catch {
      // Ignore parse failures and fall back to the status-based error.
    }

    throw new Error(message);
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

type RevisionedInput = {
  expectedRevision?: number;
};

export function hasRemoteApi() {
  return Boolean(getBaseUrl());
}

export async function fetchProjectsRemote() {
  const data = await request<{ projects: Project[] }>("/projects");
  return data?.projects ?? null;
}

export async function fetchProjectRemote(projectId: string) {
  const data = await request<{ project: Project }>(`/projects/${projectId}`);
  return data?.project ?? null;
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
  input: { email: string; name: string } & RevisionedInput,
) {
  const data = await request<{ inviteUrl?: string; message?: string; project: Project }>(
    `/projects/${projectId}/collaborators`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return data
    ? {
        inviteUrl: data.inviteUrl ?? null,
        message: data.message ?? null,
        project: data.project,
      }
    : null;
}

export async function resolveTaskRemote(
  projectId: string,
  taskId: string,
  input?: { locationLabel?: string } & RevisionedInput,
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
        expectedRevision: input?.expectedRevision,
      }),
    },
  );
  return data?.project ?? null;
}

export async function togglePageApprovalRemote(
  projectId: string,
  pageId: string,
  expectedRevision?: number,
) {
  const data = await request<{ project: Project }>(
    `/projects/${projectId}/pages/${pageId}/approval`,
    {
      method: "POST",
      body: JSON.stringify({ expectedRevision }),
    },
  );
  return data?.project ?? null;
}

export async function updatePageCopyRemote(
  projectId: string,
  pageId: string,
  input: { title: string; caption: string; confirmed?: boolean } & RevisionedInput,
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

export async function toggleMustIncludeRemote(
  projectId: string,
  photoId: string,
  expectedRevision?: number,
) {
  const data = await request<{ project: Project }>(
    `/projects/${projectId}/photos/${photoId}/must-include`,
    {
      method: "POST",
      body: JSON.stringify({ expectedRevision }),
    },
  );
  return data?.project ?? null;
}

export async function addNoteRemote(
  projectId: string,
  input: AddProjectNoteInput & RevisionedInput,
) {
  const data = await request<{ project: Project }>(`/projects/${projectId}/notes`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data?.project ?? null;
}

export async function addPhotosRemote(
  projectId: string,
  photos: AddLocalPhotoInput[],
  expectedRevision?: number,
) {
  const data = await request<{ project: Project }>(`/projects/${projectId}/photos`, {
    method: "POST",
    body: JSON.stringify({ expectedRevision, photos }),
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
  base64?: string | null,
) {
  const uploadableUri = await prepareUploadFileUri(localUri, upload.contentType, base64);

  if (uploadableUri.startsWith("file://")) {
    const uploadResponse = await FileSystem.uploadAsync(upload.uploadUrl, uploadableUri, {
      headers: {
        "Content-Type": upload.contentType,
      },
      httpMethod: "PUT",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });

    if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
      throw new Error(`Remote storage upload failed: ${uploadResponse.status}`);
    }

    return {
      downloadUrl: upload.downloadUrl,
      mimeType: upload.contentType,
      storagePath: upload.storagePath,
    };
  }

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

function getFileExtension(contentType: string) {
  const subtype = contentType.split("/")[1]?.split(";")[0]?.trim().toLowerCase();

  if (!subtype) {
    return "jpg";
  }

  if (subtype === "jpeg") {
    return "jpg";
  }

  return subtype.replace(/[^a-z0-9]/g, "") || "jpg";
}

async function prepareUploadFileUri(
  localUri: string,
  contentType: string,
  base64?: string | null,
) {
  if (localUri.startsWith("file://")) {
    return localUri;
  }

  if (!base64 || !FileSystem.cacheDirectory) {
    return localUri;
  }

  const uploadFileUri = `${FileSystem.cacheDirectory}photo-book-upload-${Date.now()}.${getFileExtension(
    contentType,
  )}`;
  await FileSystem.writeAsStringAsync(uploadFileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return uploadFileUri;
}

export async function setThemeRemote(
  projectId: string,
  selectedThemeId: string,
  expectedRevision?: number,
) {
  const data = await request<{ project: Project }>(`/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify({ expectedRevision, selectedThemeId }),
  });
  return data?.project ?? null;
}

export async function saveDraftRemote(
  projectId: string,
  input: {
    bookDraft?: Project["bookDraft"];
    draftEditorState?: BookDraftEditorState;
    selectedThemeId?: string;
    subtitle?: string;
    title?: string;
  } & RevisionedInput,
) {
  const data = await request<{ project: Project }>(`/projects/${projectId}/draft`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return data?.project ?? null;
}

export async function publishDraftRemote(
  projectId: string,
  input: {
    bookDraft?: Project["bookDraft"];
    draftEditorState?: BookDraftEditorState;
    name: string;
    selectedThemeId?: string;
    subtitle?: string;
    title?: string;
  } & RevisionedInput,
) {
  const data = await request<{ project: Project }>(`/projects/${projectId}/drafts`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data?.project ?? null;
}

export async function fetchGenerationQuestionsRemote(projectId: string) {
  const data = await request<{ questionnaire: BookGenerationQuestionnaire }>(
    `/projects/${projectId}/generation/questions`,
  );
  return data?.questionnaire ?? null;
}

export async function generateAiBookRemote(
  projectId: string,
  input: {
    expectedRevision?: number;
    questionnaire?: Partial<BookGenerationQuestionnaireAnswers>;
  },
) {
  const data = await request<{ project: Project; run?: GenerationRun }>(
    `/projects/${projectId}/generation/run`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return data
    ? {
        project: data.project,
        run: data.run ?? null,
      }
      : null;
}

export async function fetchGenerationRunRemote(projectId: string, runId: string) {
  const data = await request<{ revision: number; run: GenerationRun }>(
    `/projects/${projectId}/generation/runs/${runId}`,
  );
  return data ?? null;
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

export async function finalizeProjectRemote(
  projectId: string,
  expectedRevision?: number,
) {
  const data = await request<{ project: Project }>(`/projects/${projectId}/finalize`, {
    method: "POST",
    body: JSON.stringify({ expectedRevision }),
  });
  return data?.project ?? null;
}
