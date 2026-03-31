import type {
  BookDraft,
  BookDraftEditorState,
  BookDraftFormat,
  BookDraftFormatId,
  BookStyleMode,
  BookStoryMode,
  Project,
  PublishedBookDraft,
} from "./types";

const BOOK_DRAFT_FORMAT_LABELS: Record<BookDraftFormatId, BookDraftFormat> = {
  "8x8-square": "8x8 square",
  "10x10-square": "10x10 square",
  "12x12-square": "12x12 square",
  "11x8.5-landscape": "11x8.5 landscape",
};

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId ? `${prefix}-${randomId}` : `${prefix}-${Date.now()}`;
}

export function getBookDraftFormatLabel(formatId: BookDraftFormatId): BookDraftFormat {
  return BOOK_DRAFT_FORMAT_LABELS[formatId];
}

export function getBookDraftFormatId(format: BookDraftFormat): BookDraftFormatId {
  const matchingEntry = Object.entries(BOOK_DRAFT_FORMAT_LABELS).find(
    ([, label]) => label === format,
  );

  return (matchingEntry?.[0] as BookDraftFormatId | undefined) ?? "12x12-square";
}

function getDefaultStyleMode(project: Project): BookStyleMode {
  return project.type === "yearbook" ? "timeless_yearbook" : "minimal_editorial";
}

function getDefaultStoryMode(project: Project): BookStoryMode {
  if (project.type === "yearbook") {
    return project.yearbookCycle === "calendar_year" ? "month_by_month" : "seasonal";
  }

  return "route_story";
}

function createDefaultPhotoCaptions(project: Project) {
  return project.photos.reduce<Record<string, string>>((captions, photo) => {
    captions[photo.id] = photo.locationLabel?.trim() || photo.title;
    return captions;
  }, {});
}

export function buildDefaultDraftEditorState(project: Project): BookDraftEditorState {
  return {
    formatId: getBookDraftFormatId(project.bookDraft.format),
    styleMode: getDefaultStyleMode(project),
    fontPresetId: "gallery",
    captionTone: "warm",
    storyMode: getDefaultStoryMode(project),
    printPreviewMode: "clean",
    density: 55,
    showChapterDividers: true,
    showDates: true,
    showHandwrittenNotes: project.type === "yearbook",
    showLocations: true,
    showMaps: project.type === "trip",
    showMemorabilia: true,
    lockedPageIds: [],
    lockedPhotoIds: [],
    photoCaptions: createDefaultPhotoCaptions(project),
    updatedAt: nowIso(),
    aiProvider: "fallback",
  };
}

export function ensureDraftEditorState(project: Project): BookDraftEditorState {
  const defaults = buildDefaultDraftEditorState(project);
  const current = project.draftEditorState;
  const validPageIds = new Set(project.bookDraft.pages.map((page) => page.id));
  const validPhotoIds = new Set(project.photos.map((photo) => photo.id));

  return {
    ...defaults,
    ...current,
    photoCaptions: {
      ...defaults.photoCaptions,
      ...(current?.photoCaptions ?? {}),
    },
    lockedPageIds: (current?.lockedPageIds ?? []).filter((pageId) =>
      validPageIds.has(pageId),
    ),
    lockedPhotoIds: (current?.lockedPhotoIds ?? []).filter((photoId) =>
      validPhotoIds.has(photoId),
    ),
  };
}

export function normalizeProjectDraftState(project: Project): Project {
  const normalizedProject = cloneValue(project);
  const draftEditorState = ensureDraftEditorState(normalizedProject);
  const selectedThemeId =
    normalizedProject.selectedThemeId ||
    normalizedProject.bookDraft.themeId ||
    normalizedProject.bookThemes[0]?.id ||
    "";

  return {
    ...normalizedProject,
    selectedThemeId,
    bookDraft: {
      ...normalizedProject.bookDraft,
      themeId: selectedThemeId,
      format: getBookDraftFormatLabel(draftEditorState.formatId),
    },
    draftEditorState,
    publishedDrafts: normalizedProject.publishedDrafts ?? [],
  };
}

function normalizeWorkingDraftPayload(
  project: Project,
  payload: {
    bookDraft?: BookDraft;
    draftEditorState?: BookDraftEditorState;
    selectedThemeId?: string;
    subtitle?: string;
    title?: string;
  },
) {
  const nextProject = cloneValue(project);
  const selectedThemeId =
    payload.selectedThemeId ?? nextProject.selectedThemeId ?? nextProject.bookDraft.themeId;
  const nextBookDraft = cloneValue(payload.bookDraft ?? nextProject.bookDraft);
  const draftEditorState = ensureDraftEditorState({
    ...nextProject,
    selectedThemeId,
    bookDraft: nextBookDraft,
    draftEditorState: payload.draftEditorState ?? nextProject.draftEditorState,
  });

  return {
    ...nextProject,
    title: payload.title ?? nextProject.title,
    subtitle: payload.subtitle ?? nextProject.subtitle,
    selectedThemeId,
    bookDraft: {
      ...nextBookDraft,
      themeId: selectedThemeId,
      format: getBookDraftFormatLabel(draftEditorState.formatId),
    },
    draftEditorState: {
      ...draftEditorState,
      updatedAt: nowIso(),
    },
    publishedDrafts: nextProject.publishedDrafts ?? [],
  } satisfies Project;
}

export function saveWorkingDraft(
  project: Project,
  payload: {
    bookDraft?: BookDraft;
    draftEditorState?: BookDraftEditorState;
    selectedThemeId?: string;
    subtitle?: string;
    title?: string;
  },
) {
  return normalizeProjectDraftState(normalizeWorkingDraftPayload(project, payload));
}

export function publishCurrentDraft(
  project: Project,
  name: string,
  payload?: {
    bookDraft?: BookDraft;
    draftEditorState?: BookDraftEditorState;
    selectedThemeId?: string;
    subtitle?: string;
    title?: string;
  },
) {
  const nextProject = saveWorkingDraft(project, payload ?? {});
  const snapshot: PublishedBookDraft = {
    id: createId("published-draft"),
    name: name.trim() || `${nextProject.title} curated draft`,
    savedAt: nowIso(),
    bookDraft: cloneValue(nextProject.bookDraft),
    editorState: cloneValue(nextProject.draftEditorState ?? buildDefaultDraftEditorState(nextProject)),
    selectedThemeId: nextProject.selectedThemeId,
    projectTitle: nextProject.title,
    projectSubtitle: nextProject.subtitle,
  };

  return {
    ...nextProject,
    publishedDrafts: [snapshot, ...(nextProject.publishedDrafts ?? [])],
  } satisfies Project;
}

export function getPreviewDraft(project: Project, draftId?: string) {
  const normalizedProject = normalizeProjectDraftState(project);
  const publishedDraft = draftId
    ? normalizedProject.publishedDrafts?.find((draft) => draft.id === draftId)
    : undefined;

  if (!publishedDraft) {
    return {
      draft: normalizedProject.bookDraft,
      editorState: normalizedProject.draftEditorState ?? buildDefaultDraftEditorState(normalizedProject),
      name: "Working draft",
      savedAt: normalizedProject.draftEditorState?.updatedAt,
      selectedThemeId: normalizedProject.selectedThemeId,
      subtitle: normalizedProject.subtitle,
      title: normalizedProject.title,
    };
  }

  return {
    draft: cloneValue(publishedDraft.bookDraft),
    editorState: cloneValue(publishedDraft.editorState),
    name: publishedDraft.name,
    savedAt: publishedDraft.savedAt,
    selectedThemeId: publishedDraft.selectedThemeId,
    subtitle: publishedDraft.projectSubtitle,
    title: publishedDraft.projectTitle,
  };
}
