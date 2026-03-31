"use client";

import {
  buildDefaultDraftEditorState,
  ensureDraftEditorState,
  getBookDraftFormatLabel,
  normalizeProjectDraftState,
  type BookDraftEditorState,
  type BookDraftFormatId,
  type BookPage,
  type PublishedBookDraft,
  type PageLayoutStyle,
  type PhotoAsset,
  type Project,
} from "@photo-book-maker/core";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  APPROVED_SPREAD_LIBRARY,
  STYLE_MODE_OPTIONS,
  deriveStoryChapters,
  getCaptionToneOptions,
  getLayoutAlternatives,
  getPageWarnings,
  getStoryModeOptions,
  normalizeSpreadType,
  type ApprovedSpreadType,
  type EditorCaptionTone,
  type EditorStoryMode,
  type EditorStyleMode,
  type PrintPreviewMode,
  type StoryChapter,
} from "@/lib/book-editor";
import { FONT_PRESETS, type FontPresetId } from "@/lib/font-presets";
import { getBookThemePresentation } from "@/lib/book-theme-styles";

type EditorState = BookDraftEditorState & {
  project: Project;
};

type EditorControls = Pick<
  EditorState,
  | "captionTone"
  | "density"
  | "printPreviewMode"
  | "showDates"
  | "showHandwrittenNotes"
  | "showLocations"
  | "showMaps"
  | "showMemorabilia"
>;

type InspectorTab = "book" | "story" | "spread" | "photo" | "publish";

const FORMAT_OPTIONS: Array<{
  helper: string;
  id: BookDraftFormatId;
  label: string;
  maxWidth: string;
}> = [
  {
    id: "8x8-square",
    label: "8 x 8 square",
    helper: "Compact keepsake with tighter pacing and lighter spreads.",
    maxWidth: "34rem",
  },
  {
    id: "10x10-square",
    label: "10 x 10 square",
    helper: "Classic gift format for most trip books.",
    maxWidth: "40rem",
  },
  {
    id: "12x12-square",
    label: "12 x 12 square",
    helper: "Premium coffee-table format with generous hero pages.",
    maxWidth: "46rem",
  },
  {
    id: "11x8.5-landscape",
    label: "11 x 8.5 landscape",
    helper: "Travel lookbook format with a cinematic horizontal rhythm.",
    maxWidth: "56rem",
  },
];

const PRINT_PREVIEW_OPTIONS: Array<{
  helper: string;
  id: PrintPreviewMode;
  label: string;
}> = [
  {
    id: "clean",
    label: "Clean preview",
    helper: "Focus on pacing and spread composition only.",
  },
  {
    id: "print_safe",
    label: "Print-safe preview",
    helper: "Show safe text zones and gutter risk before export.",
  },
  {
    id: "bleed",
    label: "Bleed preview",
    helper: "Show trim, bleed, and gutter overlays for final checks.",
  },
];

type DraftMutationPayload = {
  bookDraft: Project["bookDraft"];
  draftEditorState: BookDraftEditorState;
  selectedThemeId: string;
  subtitle: string;
  title: string;
};

function buildDraftMutationPayload(editorState: EditorState): DraftMutationPayload {
  const normalizedEditorState = ensureDraftEditorState({
    ...editorState.project,
    draftEditorState: {
      ...editorState,
    },
  });

  return {
    bookDraft: {
      ...editorState.project.bookDraft,
      format: getBookDraftFormatLabel(normalizedEditorState.formatId),
      themeId: editorState.project.selectedThemeId,
    },
    draftEditorState: {
      ...normalizedEditorState,
      fontPresetId: editorState.fontPresetId,
    },
    selectedThemeId: editorState.project.selectedThemeId,
    subtitle: editorState.project.subtitle,
    title: editorState.project.title,
  };
}

function buildEditorStateSignature(editorState: EditorState) {
  const normalizedEditorState = ensureDraftEditorState({
    ...editorState.project,
    draftEditorState: {
      ...editorState,
    },
  });

  return JSON.stringify({
    draftEditorState: normalizedEditorState,
    bookDraft: editorState.project.bookDraft,
    selectedThemeId: editorState.project.selectedThemeId,
    subtitle: editorState.project.subtitle,
    title: editorState.project.title,
  });
}

export function BookDraftEditor({
  onPublishDraft,
  onRefreshAi,
  onSaveDraft,
  previewHref,
  project,
  workspaceMode = "demo",
}: {
  onPublishDraft?: (name: string, payload: DraftMutationPayload) => Promise<Project>;
  onRefreshAi?: (payload: DraftMutationPayload) => Promise<Project>;
  onSaveDraft?: (payload: DraftMutationPayload) => Promise<Project>;
  previewHref?: (draftId?: string) => string;
  project: Project;
  workspaceMode?: "authenticated" | "demo";
}) {
  const [editorState, setEditorState] = useState<EditorState>(() =>
    createInitialEditorState(project),
  );
  const [draftName, setDraftName] = useState(`${project.title} - Curated edit`);
  const [selectedPageId, setSelectedPageId] = useState(
    project.bookDraft.pages[0]?.id ?? "",
  );
  const [selectedPhotoId, setSelectedPhotoId] = useState(
    project.bookDraft.pages[0]?.photoIds[0] ?? "",
  );
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("spread");
  const [isAiRefreshing, setIsAiRefreshing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSyncedSignature, setLastSyncedSignature] = useState(() =>
    buildEditorStateSignature(createInitialEditorState(project)),
  );

  useEffect(() => {
    const nextEditorState = createInitialEditorState(project);
    setEditorState(nextEditorState);
    setLastSyncedSignature(buildEditorStateSignature(nextEditorState));
    setDraftName(`${project.title} - Curated edit`);
    setSelectedPageId(project.bookDraft.pages[0]?.id ?? "");
    setSelectedPhotoId(project.bookDraft.pages[0]?.photoIds[0] ?? "");
    setInspectorTab("spread");
  }, [project]);

  useEffect(() => {
    if (!selectedPageId) {
      const firstPage = editorState.project.bookDraft.pages[0];
      if (firstPage) {
        setSelectedPageId(firstPage.id);
        setSelectedPhotoId(firstPage.photoIds[0] ?? "");
      }
      return;
    }

    const nextSelectedPage = editorState.project.bookDraft.pages.find(
      (page) => page.id === selectedPageId,
    );

    if (!nextSelectedPage) {
      const fallback = editorState.project.bookDraft.pages[0];
      if (fallback) {
        setSelectedPageId(fallback.id);
        setSelectedPhotoId(fallback.photoIds[0] ?? "");
      }
      return;
    }

    if (!selectedPhotoId || !nextSelectedPage.photoIds.includes(selectedPhotoId)) {
      setSelectedPhotoId(nextSelectedPage.photoIds[0] ?? "");
    }
  }, [editorState.project.bookDraft.pages, selectedPageId, selectedPhotoId]);

  useEffect(() => {
    if (!onSaveDraft || workspaceMode !== "authenticated") {
      return;
    }

    const signature = buildEditorStateSignature(editorState);
    if (signature === lastSyncedSignature) {
      return;
    }

    const timeout = window.setTimeout(async () => {
      setIsSaving(true);
      try {
        const projectFromServer = await onSaveDraft(buildDraftMutationPayload(editorState));
        const nextEditorState = createInitialEditorState(projectFromServer);
        setEditorState(nextEditorState);
        setLastSyncedSignature(buildEditorStateSignature(nextEditorState));
        setPublishMessage("Working draft saved.");
      } catch (caughtError) {
        setPublishMessage(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to save the working draft.",
        );
      } finally {
        setIsSaving(false);
      }
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [editorState, lastSyncedSignature, onSaveDraft, workspaceMode]);

  const selectedPage =
    editorState.project.bookDraft.pages.find((page) => page.id === selectedPageId) ??
    editorState.project.bookDraft.pages[0];
  const selectedPhoto = editorState.project.photos.find(
    (photo) => photo.id === selectedPhotoId,
  );
  const selectedPagePhotos = selectedPage
    ? getPagePhotos(editorState.project, selectedPage)
    : [];
  const selectedFormat =
    FORMAT_OPTIONS.find((format) => format.id === editorState.formatId) ??
    FORMAT_OPTIONS[2];
  const selectedStyle =
    STYLE_MODE_OPTIONS.find((style) => style.id === editorState.styleMode) ??
    STYLE_MODE_OPTIONS[0];
  const selectedFont =
    FONT_PRESETS.find((font) => font.id === editorState.fontPresetId) ?? FONT_PRESETS[0];
  const selectedTheme =
    editorState.project.bookThemes.find(
      (theme) => theme.id === editorState.project.selectedThemeId,
    ) ?? editorState.project.bookThemes[0];
  const publishedDrafts = editorState.project.publishedDrafts ?? [];
  const selectedPageIndex = Math.max(
    0,
    editorState.project.bookDraft.pages.findIndex((page) => page.id === selectedPage?.id),
  );
  const pageCount = editorState.project.bookDraft.pages.length;

  const storyModeOptions = getStoryModeOptions(editorState.project);
  const captionToneOptions = getCaptionToneOptions();
  const chapters = useMemo(
    () => deriveStoryChapters(editorState.project, editorState.storyMode),
    [editorState.project, editorState.storyMode],
  );
  const selectedChapter = chapters.find((chapter) =>
    chapter.pageIds.includes(selectedPage?.id ?? ""),
  );
  const selectedAlternatives = selectedPage
    ? getLayoutAlternatives(editorState.project, selectedPage, selectedPagePhotos)
    : [];
  const selectedWarnings = selectedPage
    ? getPageWarnings(selectedPage, selectedPagePhotos, editorState.formatId)
    : [];
  const themePresentation = getBookThemePresentation(
    selectedTheme,
    editorState.styleMode,
  );

  function updateEditorState(updater: (current: EditorState) => EditorState) {
    setEditorState((current) => updater(current));
  }

  function updatePage(pageId: string, updater: (page: BookPage) => BookPage) {
    updateEditorState((current) => ({
      ...current,
      project: {
        ...current.project,
        bookDraft: {
          ...current.project.bookDraft,
          pages: current.project.bookDraft.pages.map((page) =>
            page.id === pageId ? updater(page) : page,
          ),
        },
      },
    }));
  }

  function updateProjectMeta(updater: (current: Project) => Project) {
    updateEditorState((current) => ({
      ...current,
      project: updater(current.project),
    }));
  }

  function handlePhotoMove(photoId: string, targetPageId: string) {
    if (editorState.lockedPhotoIds.includes(photoId)) {
      setPublishMessage("Unlock this photo before moving it.");
      return;
    }

    updateEditorState((current) => {
      const pages = current.project.bookDraft.pages.map((page) => {
        const filteredPhotoIds = page.photoIds.filter((entry) => entry !== photoId);

        if (page.id !== targetPageId) {
          return {
            ...page,
            photoIds: filteredPhotoIds,
          };
        }

        return {
          ...page,
          photoIds: filteredPhotoIds.includes(photoId)
            ? filteredPhotoIds
            : [...filteredPhotoIds, photoId],
        };
      });

      return {
        ...current,
        project: {
          ...current.project,
          bookDraft: {
            ...current.project.bookDraft,
            pages,
          },
        },
      };
    });

    setSelectedPageId(targetPageId);
    setSelectedPhotoId(photoId);
    setPublishMessage("Photo moved. The spread reflowed automatically.");
  }

  function toggleLockedPage(pageId: string) {
    updateEditorState((current) => ({
      ...current,
      lockedPageIds: current.lockedPageIds.includes(pageId)
        ? current.lockedPageIds.filter((entry) => entry !== pageId)
        : [...current.lockedPageIds, pageId],
    }));
  }

  function toggleLockedPhoto(photoId: string) {
    updateEditorState((current) => ({
      ...current,
      lockedPhotoIds: current.lockedPhotoIds.includes(photoId)
        ? current.lockedPhotoIds.filter((entry) => entry !== photoId)
        : [...current.lockedPhotoIds, photoId],
    }));
  }

  function shuffleSelectedPageLayout() {
    if (!selectedPage) {
      return;
    }

    if (editorState.lockedPageIds.includes(selectedPage.id)) {
      setPublishMessage("Unlock this page before shuffling alternatives.");
      return;
    }

    const alternatives = getLayoutAlternatives(
      editorState.project,
      selectedPage,
      selectedPagePhotos,
    );
    const current = normalizeSpreadType(selectedPage.style);
    const currentIndex = alternatives.indexOf(current);
    const next = alternatives[(currentIndex + 1) % alternatives.length] ?? current;

    updatePage(selectedPage.id, (page) => ({
      ...page,
      style: next as PageLayoutStyle,
    }));
    setPublishMessage(`Switched to ${getSpreadLabel(next)}.`);
  }

  async function publishDraft() {
    if (!onPublishDraft || workspaceMode !== "authenticated") {
      setPublishMessage("Sign in to publish drafts across devices.");
      return;
    }

    setIsPublishing(true);
    try {
      const projectFromServer = await onPublishDraft(
        draftName.trim() ||
          `${editorState.project.title} - ${new Date().toLocaleTimeString()}`,
        buildDraftMutationPayload(editorState),
      );
      const nextEditorState = createInitialEditorState(projectFromServer);
      setEditorState(nextEditorState);
      setLastSyncedSignature(buildEditorStateSignature(nextEditorState));
      const latestDraft = projectFromServer.publishedDrafts?.[0];
      setPublishMessage(
        latestDraft ? `Published ${latestDraft.name}` : "Published current draft.",
      );
    } catch (caughtError) {
      setPublishMessage(
        caughtError instanceof Error ? caughtError.message : "Unable to publish this draft.",
      );
    } finally {
      setIsPublishing(false);
    }
  }

  function loadDraft(snapshot: PublishedBookDraft) {
    const projectFromSnapshot = normalizeProjectDraftState({
      ...editorState.project,
      title: snapshot.projectTitle,
      subtitle: snapshot.projectSubtitle,
      selectedThemeId: snapshot.selectedThemeId,
      bookDraft: snapshot.bookDraft,
      draftEditorState: snapshot.editorState,
    });
    const nextEditorState = createInitialEditorState(projectFromSnapshot);
    setEditorState(nextEditorState);
    setLastSyncedSignature(buildEditorStateSignature(nextEditorState));
    setSelectedPageId(projectFromSnapshot.bookDraft.pages[0]?.id ?? "");
    setSelectedPhotoId(projectFromSnapshot.bookDraft.pages[0]?.photoIds[0] ?? "");
    setDraftName(snapshot.name);
    setInspectorTab("spread");
    setPublishMessage(`Loaded ${snapshot.name}`);
  }

  async function refreshAiSuggestions() {
    if (!onRefreshAi || workspaceMode !== "authenticated") {
      setPublishMessage("Sign in to refresh AI suggestions.");
      return;
    }

    setIsAiRefreshing(true);
    try {
      const projectFromServer = await onRefreshAi(buildDraftMutationPayload(editorState));
      const nextEditorState = createInitialEditorState(projectFromServer);
      setEditorState(nextEditorState);
      setLastSyncedSignature(buildEditorStateSignature(nextEditorState));
      setPublishMessage("Rebuilt the draft with updated AI suggestions.");
    } catch (caughtError) {
      setPublishMessage(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to refresh AI suggestions right now.",
      );
    } finally {
      setIsAiRefreshing(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.16fr)_24rem]">
      <div className="space-y-5">
        <section
          className="rounded-[2.35rem] px-6 py-6 md:px-8"
          style={themePresentation.appStyle}
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <div className="eyebrow">Book art direction</div>
              <h2
                className="display mt-2 text-4xl sm:text-5xl"
                style={{ color: themePresentation.textColor }}
              >
                Flip through one spread at a time.
              </h2>
              <p className="mt-3 text-sm leading-7" style={{ color: themePresentation.textMuted }}>
                This editor keeps the whole workspace anchored around the active spread:
                theme, book settings, copy, photo movement, and publish controls stay
                in one place while you page through the book.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/projects/${project.id}`}
                className="rounded-full px-4 py-2 text-sm font-medium transition-colors hover:bg-white"
                style={themePresentation.secondaryButtonStyle}
              >
                Back to proof board
              </Link>
              <Link
                href={previewHref?.() ?? `/projects/${project.id}/preview`}
                className="rounded-full px-4 py-2 text-sm font-medium transition-colors"
                style={themePresentation.primaryButtonStyle}
              >
                Open clean preview
              </Link>
              <span
                className="rounded-full px-4 py-2 text-sm font-medium"
                style={themePresentation.secondaryButtonStyle}
              >
                {workspaceMode === "authenticated"
                  ? isSaving
                    ? "Saving..."
                    : "Syncing to your account"
                  : "Demo mode"}
              </span>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <EditorStat label="Format" value={selectedFormat.label} />
            <EditorStat label="Style mode" value={selectedStyle.label} />
            <EditorStat
              label="Story mode"
              value={
                storyModeOptions.find((option) => option.id === editorState.storyMode)?.label ??
                "Route story"
              }
            />
            <EditorStat
              label="Spread library"
              value={`${selectedPageIndex + 1}/${pageCount || 1} active`}
            />
          </div>
        </section>

        {selectedPage ? (
          <section
            className="grid gap-5 overflow-hidden rounded-[2.35rem] p-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:p-5 xl:min-h-[calc(100vh-12rem)]"
            style={themePresentation.chromeStyle}
          >
            <div className="space-y-4">
              <div className="rounded-[1.7rem] p-4" style={themePresentation.mutedPanelStyle}>
                <div className="text-xs uppercase tracking-[0.18em]" style={{ color: themePresentation.textMuted }}>
                  Story map
                </div>
                <div className="mt-4 space-y-3">
                  {chapters.map((chapter, index) => (
                    <button
                      key={chapter.id}
                      type="button"
                      onClick={() => {
                        const firstPageId = chapter.pageIds[0];
                        if (firstPageId) {
                          setSelectedPageId(firstPageId);
                          setInspectorTab("spread");
                        }
                      }}
                      className="w-full rounded-[1.2rem] border px-4 py-3 text-left transition-colors"
                      style={
                        chapter.pageIds.includes(selectedPage.id)
                          ? themePresentation.pagerActiveStyle
                          : themePresentation.secondaryButtonStyle
                      }
                    >
                      <div className="text-[11px] uppercase tracking-[0.18em] opacity-70">
                        Chapter {index + 1}
                      </div>
                      <div className="mt-1 font-semibold">{chapter.title}</div>
                      <div className="mt-1 text-xs leading-5 opacity-75">
                        {chapter.pageIds.length} spreads
                      </div>
                    </button>
                  ))}
                </div>
                <div className="mt-4 rounded-[1.2rem] border border-black/5 bg-white/66 px-4 py-4 text-sm leading-7" style={{ color: themePresentation.textMuted }}>
                  {selectedTheme.name} is active, and every theme shift now updates the page chrome, controls, and book canvas instead of just a small accent chip.
                </div>
              </div>

              {selectedWarnings.length ? (
                <div className="rounded-[1.7rem] border border-[#f0d1bf] bg-[#fff7f1] p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[#a55d35]">
                    Print warnings
                  </div>
                  <div className="mt-3 space-y-2">
                    {selectedWarnings.map((warning) => (
                      <div
                        key={warning}
                        className="rounded-[1rem] border border-[#f2ddd0] bg-white/86 px-3 py-3 text-sm text-[#6e5342]"
                      >
                        {warning}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="min-h-0 space-y-4">
              {editorState.showChapterDividers && selectedChapter ? (
                <ChapterDividerPreview
                  chapter={selectedChapter}
                  fontPreset={selectedFont}
                  styleMode={editorState.styleMode}
                />
              ) : null}

              <div
                className="rounded-[2rem] p-4 md:p-5"
                style={themePresentation.canvasFrameStyle}
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-black/5 pb-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em]" style={{ color: themePresentation.textMuted }}>
                      {selectedChapter ? `${selectedChapter.title} / ` : ""}Spread {selectedPageIndex + 1} of {pageCount}
                    </div>
                    <div
                      className="mt-2 text-2xl font-semibold"
                      style={{ color: themePresentation.textColor, fontFamily: selectedFont.headline }}
                    >
                      {selectedPage.title}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <EditorTag className={selectedStyle.chipClass}>
                      {getSpreadLabel(selectedPage.style)}
                    </EditorTag>
                    <EditorTag className="bg-[#f2ebe4] text-[#6f625b]">
                      {selectedPage.storyBeat.replaceAll("_", " ")}
                    </EditorTag>
                    <EditorTag
                      className={
                        selectedPage.copyStatus === "confirmed"
                          ? "bg-[#dfeee7] text-[#2d624b]"
                          : "bg-[#f5e9dc] text-[#8f5a33]"
                      }
                    >
                      {selectedPage.copyStatus === "confirmed" ? "copy confirmed" : "needs review"}
                    </EditorTag>
                  </div>
                </div>

                <div
                  className={`mx-auto w-full overflow-hidden rounded-[2rem] p-4 md:p-5 ${selectedStyle.shellClass}`}
                  style={{
                    ...themePresentation.canvasStyle,
                    maxWidth: selectedFormat.maxWidth,
                  }}
                >
                  <EditorSpreadCanvas
                    accent={selectedTheme.accent}
                    controls={{
                      captionTone: editorState.captionTone,
                      density: editorState.density,
                      printPreviewMode: editorState.printPreviewMode,
                      showDates: editorState.showDates,
                      showHandwrittenNotes: editorState.showHandwrittenNotes,
                      showLocations: editorState.showLocations,
                      showMaps: editorState.showMaps,
                      showMemorabilia: editorState.showMemorabilia,
                    }}
                    fontPreset={selectedFont}
                    formatId={selectedFormat.id}
                    page={selectedPage}
                    pageIndex={selectedPageIndex}
                    pagePhotos={selectedPagePhotos}
                    photoCaptions={editorState.photoCaptions}
                    project={editorState.project}
                    selectedPhotoId={selectedPhotoId}
                    styleMode={editorState.styleMode}
                    onSelectPhoto={(photoId) => {
                      setSelectedPageId(selectedPage.id);
                      setSelectedPhotoId(photoId);
                      setInspectorTab("photo");
                    }}
                  />
                </div>

                <EditorPageNavigator
                  activeStyle={themePresentation.pagerActiveStyle}
                  currentIndex={selectedPageIndex}
                  idleStyle={themePresentation.secondaryButtonStyle}
                  onSelectPage={(index) => {
                    const nextPage = editorState.project.bookDraft.pages[index];
                    if (nextPage) {
                      setSelectedPageId(nextPage.id);
                      setInspectorTab("spread");
                    }
                  }}
                  pages={editorState.project.bookDraft.pages}
                />
              </div>
            </div>
          </section>
        ) : null}
      </div>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:self-start">
        <section
          className="rounded-[2rem] border border-[#00000012] bg-white/92 p-3"
          style={themePresentation.chromeStyle}
        >
          <div className="grid grid-cols-2 gap-2">
            <InspectorTabButton
              active={inspectorTab === "book"}
              label="Book"
              onClick={() => setInspectorTab("book")}
            />
            <InspectorTabButton
              active={inspectorTab === "story"}
              label="Story"
              onClick={() => setInspectorTab("story")}
            />
            <InspectorTabButton
              active={inspectorTab === "spread"}
              label="Spread"
              onClick={() => setInspectorTab("spread")}
            />
            <InspectorTabButton
              active={inspectorTab === "photo"}
              label="Photo"
              onClick={() => setInspectorTab("photo")}
            />
            <InspectorTabButton
              active={inspectorTab === "publish"}
              label="Publish"
              onClick={() => setInspectorTab("publish")}
            />
            <div
              className="rounded-[1.2rem] border border-black/5 bg-white/62 px-3 py-3 text-xs uppercase tracking-[0.16em]"
              style={{ color: themePresentation.textMuted }}
            >
              {selectedPageIndex + 1}/{pageCount} active
            </div>
          </div>
        </section>

        <div className="space-y-4 xl:max-h-[calc(100vh-11rem)] xl:overflow-y-auto xl:pr-1">
        {inspectorTab === "book" ? (
        <section className="rounded-[2rem] border border-[#00000012] bg-white/92 p-5">
          <div className="eyebrow">Book system</div>
          <div className="mt-4 space-y-4">
            <SelectField
              label="Book size"
              helper="Choose the print trim before publishing a draft."
              options={FORMAT_OPTIONS.map((option) => ({
                helper: option.helper,
                id: option.id,
                label: option.label,
              }))}
              selectedId={editorState.formatId}
                onSelect={(formatId) =>
                  updateEditorState((current) => ({
                    ...current,
                    formatId: formatId as BookDraftFormatId,
                  }))
                }
            />
            <SelectField
              label="Style mode"
              helper="Swap the overall art direction without rebuilding the story."
              options={STYLE_MODE_OPTIONS.map((option) => ({
                helper: option.description,
                id: option.id,
                label: option.label,
              }))}
              selectedId={editorState.styleMode}
              onSelect={(styleMode) =>
                updateEditorState((current) => ({
                  ...current,
                  styleMode: styleMode as EditorStyleMode,
                }))
              }
            />
            <SelectField
              label="Story mode"
              helper="Reframe the narrative around route, date, theme, or people."
              options={storyModeOptions}
              selectedId={editorState.storyMode}
              onSelect={(storyMode) =>
                updateEditorState((current) => ({
                  ...current,
                  storyMode: storyMode as EditorStoryMode,
                }))
              }
            />
            <SelectField
              label="Font direction"
              helper="Keep this to two families in the final print proof."
              options={FONT_PRESETS.map((option) => ({
                helper: option.description,
                id: option.id,
                label: option.label,
              }))}
              selectedId={editorState.fontPresetId}
              onSelect={(fontPresetId) =>
                updateEditorState((current) => ({
                  ...current,
                  fontPresetId: fontPresetId as FontPresetId,
                }))
              }
            />
            <SelectField
              label="Caption tone"
              helper="Prefilled copy can sound factual, warm, reflective, or playful."
              options={captionToneOptions}
              selectedId={editorState.captionTone}
              onSelect={(captionTone) =>
                updateEditorState((current) => ({
                  ...current,
                  captionTone: captionTone as EditorCaptionTone,
                }))
              }
            />
            <SelectField
              label="Print preview"
              helper="Switch between clean, safe-zone, and bleed overlays."
              options={PRINT_PREVIEW_OPTIONS}
              selectedId={editorState.printPreviewMode}
              onSelect={(printPreviewMode) =>
                updateEditorState((current) => ({
                  ...current,
                  printPreviewMode: printPreviewMode as PrintPreviewMode,
                }))
              }
            />
            <RangeField
              label="Page density"
              helper="Lower density adds whitespace. Higher density packs more support shots."
              min={20}
              max={100}
              step={5}
              value={editorState.density}
              onChange={(density) =>
                updateEditorState((current) => ({
                  ...current,
                  density,
                }))
              }
            />
          </div>
        </section>
        ) : null}

        {inspectorTab === "story" ? (
        <section className="rounded-[2rem] border border-[#00000012] bg-white/92 p-5">
          <div className="eyebrow">Story controls</div>
          <div className="mt-4 space-y-3">
            <ToggleField
              label="Chapter dividers"
              helper="Show text-led chapter breaks between acts."
              checked={editorState.showChapterDividers}
              onChange={(checked) =>
                updateEditorState((current) => ({
                  ...current,
                  showChapterDividers: checked,
                }))
              }
            />
            <ToggleField
              label="Date labels"
              helper="Use date metadata in captions and photo notes."
              checked={editorState.showDates}
              onChange={(checked) =>
                updateEditorState((current) => ({
                  ...current,
                  showDates: checked,
                }))
              }
            />
            <ToggleField
              label="Location labels"
              helper="Keep where each photo happened visible in the draft."
              checked={editorState.showLocations}
              onChange={(checked) =>
                updateEditorState((current) => ({
                  ...current,
                  showLocations: checked,
                }))
              }
            />
            <ToggleField
              label="Map / timeline blocks"
              helper="Show route context on openers and context spreads."
              checked={editorState.showMaps}
              onChange={(checked) =>
                updateEditorState((current) => ({
                  ...current,
                  showMaps: checked,
                }))
              }
            />
            <ToggleField
              label="Memorabilia blocks"
              helper="Let detail spreads hold tickets, food, and object notes."
              checked={editorState.showMemorabilia}
              onChange={(checked) =>
                updateEditorState((current) => ({
                  ...current,
                  showMemorabilia: checked,
                }))
              }
            />
            <ToggleField
              label="Handwritten note blocks"
              helper="Adds warmer note-style accents to journal-led pages."
              checked={editorState.showHandwrittenNotes}
              onChange={(checked) =>
                updateEditorState((current) => ({
                  ...current,
                  showHandwrittenNotes: checked,
                }))
              }
            />
          </div>
        </section>
        ) : null}

        {inspectorTab === "book" ? (
        <section className="rounded-[2rem] border border-[#00000012] bg-white/92 p-5">
          <div className="eyebrow">Cover and title wizard</div>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-xs uppercase tracking-[0.18em] text-[#7a6e65]">
                Book title
              </span>
              <input
                type="text"
                value={editorState.project.title}
                onChange={(event) =>
                  updateProjectMeta((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
              />
            </label>

            <label className="block">
              <span className="text-xs uppercase tracking-[0.18em] text-[#7a6e65]">
                Cover subtitle
              </span>
              <input
                type="text"
                value={editorState.project.subtitle}
                onChange={(event) =>
                  updateProjectMeta((current) => ({
                    ...current,
                    subtitle: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
              />
            </label>

            <label className="block">
              <span className="text-xs uppercase tracking-[0.18em] text-[#7a6e65]">
                Proof summary
              </span>
              <textarea
                rows={4}
                value={editorState.project.bookDraft.summary}
                onChange={(event) =>
                  updateProjectMeta((current) => ({
                    ...current,
                    bookDraft: {
                      ...current.bookDraft,
                      summary: event.target.value,
                    },
                  }))
                }
                className="mt-2 w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm leading-7 text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
              />
            </label>

            <SelectField
              label="Theme"
              helper="Swap the book theme without changing the chapter structure."
              options={editorState.project.bookThemes.map((theme) => ({
                helper: `${theme.mood} / ${theme.typeface}`,
                id: theme.id,
                label: theme.name,
              }))}
              selectedId={editorState.project.selectedThemeId}
              onSelect={(themeId) =>
                updateProjectMeta((current) => ({
                  ...current,
                  bookDraft: {
                    ...current.bookDraft,
                    themeId,
                  },
                  selectedThemeId: themeId,
                }))
              }
            />
          </div>
        </section>
        ) : null}

        {selectedPage && inspectorTab === "spread" ? (
          <section className="rounded-[2rem] border border-[#00000012] bg-white/92 p-5">
            <div className="eyebrow">Selected spread</div>
            <div className="mt-4 space-y-4">
              <div className="rounded-[1.3rem] border border-[#00000010] bg-[#fff9f4] px-4 py-4 text-sm leading-7 text-[#655a53]">
                {selectedChapter ? (
                  <>
                    <strong className="font-semibold text-[#201915]">
                      {selectedChapter.title}
                    </strong>
                    <span className="mx-2 text-[#b59d8d]">/</span>
                    {selectedChapter.subtitle}
                  </>
                ) : (
                  "This spread is currently outside a visible chapter block."
                )}
              </div>

              <label className="block">
                <span className="text-xs uppercase tracking-[0.18em] text-[#7a6e65]">
                  Spread title
                </span>
                <input
                  type="text"
                  value={selectedPage.title}
                  onChange={(event) =>
                    updatePage(selectedPage.id, (page) => ({
                      ...page,
                      title: event.target.value,
                      copySource: "manual",
                    }))
                  }
                  className="mt-2 w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
                />
              </label>

              <label className="block">
                <span className="text-xs uppercase tracking-[0.18em] text-[#7a6e65]">
                  Spread caption
                </span>
                <textarea
                  rows={5}
                  value={selectedPage.caption}
                  onChange={(event) =>
                    updatePage(selectedPage.id, (page) => ({
                      ...page,
                      caption: event.target.value,
                      copySource: "manual",
                    }))
                  }
                  className="mt-2 w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm leading-7 text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
                />
              </label>

              <SelectField
                label="Approved spread type"
                helper="Pages should only use approved templates, not free-form collage rules."
                options={APPROVED_SPREAD_LIBRARY.map((spread) => ({
                  helper: spread.helper,
                  id: spread.id,
                  label: spread.label,
                }))}
                selectedId={normalizeSpreadType(selectedPage.style)}
                onSelect={(spreadType) =>
                  updatePage(selectedPage.id, (page) => ({
                    ...page,
                    style: spreadType as PageLayoutStyle,
                  }))
                }
              />

              {selectedAlternatives.length ? (
                <div className="space-y-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-[#7a6e65]">
                    Suggested alternatives
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedAlternatives.map((alternative) => (
                      <button
                        key={alternative}
                        type="button"
                        onClick={() =>
                          updatePage(selectedPage.id, (page) => ({
                            ...page,
                            style: alternative as PageLayoutStyle,
                          }))
                        }
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition-colors ${normalizeSpreadType(selectedPage.style) === alternative ? "border-[#8f4f2e44] bg-[#fff0e4] text-[#8f4f2e]" : "border-[#00000012] bg-white/75 text-[#675c55] hover:bg-white"}`}
                      >
                        {getSpreadLabel(alternative)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={shuffleSelectedPageLayout}
                className="w-full rounded-full border border-[#00000014] bg-[#fff9f4] px-4 py-3 text-sm font-semibold text-[#1f1814] transition-colors hover:bg-white"
              >
                Shuffle alternatives
              </button>

              <ToggleField
                label="Lock page"
                helper="Stops layout shuffles for this spread."
                checked={editorState.lockedPageIds.includes(selectedPage.id)}
                onChange={() => toggleLockedPage(selectedPage.id)}
              />
              <ToggleField
                label="Copy confirmed"
                helper="Marks the spread copy as reviewed and ready."
                checked={selectedPage.copyStatus === "confirmed"}
                onChange={(checked) =>
                  updatePage(selectedPage.id, (page) => ({
                    ...page,
                    copyStatus: checked ? "confirmed" : "prefilled",
                    copySource: checked && page.copySource !== "manual" ? "hybrid" : page.copySource,
                  }))
                }
              />
              <ToggleField
                label="Page approved"
                helper="Use this when the visual treatment is locked."
                checked={selectedPage.approved}
                onChange={(checked) =>
                  updatePage(selectedPage.id, (page) => ({
                    ...page,
                    approved: checked,
                  }))
                }
              />

              {selectedWarnings.length ? (
                <div className="rounded-[1.3rem] border border-[#f0d1bf] bg-[#fff7f1] px-4 py-4 text-sm leading-7 text-[#704f39]">
                  <div className="text-xs uppercase tracking-[0.18em] text-[#a55d35]">
                    Current warnings
                  </div>
                  <div className="mt-3 space-y-2">
                    {selectedWarnings.map((warning) => (
                      <div key={warning}>{warning}</div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {selectedPhoto && inspectorTab === "photo" ? (
          <section className="rounded-[2rem] border border-[#00000012] bg-white/92 p-5">
            <div className="eyebrow">Selected photo</div>
            <div className="mt-4 space-y-4">
              <div className="overflow-hidden rounded-[1.5rem] border border-[#00000010] bg-[#f7f0ea]">
                <div className="relative aspect-[4/3] overflow-hidden bg-[#e9dfd3]">
                  {selectedPhoto.imageUri ? (
                    <img
                      src={selectedPhoto.imageUri}
                      alt={selectedPhoto.title}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="px-4 py-4">
                  <div className="font-semibold text-[#1f1814]">{selectedPhoto.title}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[#7b6f67]">
                    {buildPhotoMetaLine(
                      selectedPhoto,
                      editorState.project,
                      editorState.showDates,
                      editorState.showLocations,
                    )}
                  </div>
                </div>
              </div>

              <label className="block">
                <span className="text-xs uppercase tracking-[0.18em] text-[#7a6e65]">
                  Photo-specific caption
                </span>
                <textarea
                  rows={4}
                  value={editorState.photoCaptions[selectedPhoto.id] ?? ""}
                  onChange={(event) =>
                    updateEditorState((current) => ({
                      ...current,
                      photoCaptions: {
                        ...current.photoCaptions,
                        [selectedPhoto.id]: event.target.value,
                      },
                    }))
                  }
                  className="mt-2 w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm leading-7 text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
                />
              </label>

              <SelectField
                label="Move photo to spread"
                helper="The target spread reflows automatically instead of hiding the extra image."
                options={editorState.project.bookDraft.pages.map((page, index) => ({
                  helper: getSpreadLabel(page.style),
                  id: page.id,
                  label: `Spread ${index + 1} - ${page.title}`,
                }))}
                selectedId={findPhotoPageId(editorState.project, selectedPhoto.id)}
                onSelect={(pageId) => handlePhotoMove(selectedPhoto.id, pageId)}
              />

              <ToggleField
                label="Lock crop / placement"
                helper="Use this before experimenting with other spreads."
                checked={editorState.lockedPhotoIds.includes(selectedPhoto.id)}
                onChange={() => toggleLockedPhoto(selectedPhoto.id)}
              />
            </div>
          </section>
        ) : null}

        {inspectorTab === "publish" ? (
        <section className="rounded-[2rem] border border-[#00000012] bg-white/92 p-5">
          <div className="eyebrow">Publish draft</div>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-xs uppercase tracking-[0.18em] text-[#7a6e65]">
                Draft name
              </span>
              <input
                type="text"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                className="mt-2 w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
              />
            </label>

            <button
              type="button"
              onClick={refreshAiSuggestions}
              disabled={isAiRefreshing || workspaceMode !== "authenticated"}
              className="w-full rounded-full border border-[#00000014] bg-[#fff9f4] px-4 py-3 text-sm font-semibold text-[#1f1814] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isAiRefreshing ? "Refreshing AI suggestions..." : "Rebuild story + AI captions"}
            </button>

            <button
              type="button"
              onClick={publishDraft}
              disabled={isPublishing || workspaceMode !== "authenticated"}
              className="w-full rounded-full bg-[#1f1814] px-4 py-3 text-sm font-semibold text-[#f8efe7] transition-colors hover:bg-[#302721] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPublishing ? "Publishing draft..." : "Publish draft"}
            </button>

            {publishMessage ? (
              <div className="rounded-[1.1rem] border border-[#d9c7b9] bg-[#fff8f2] px-4 py-3 text-sm text-[#6d5544]">
                {publishMessage}
              </div>
            ) : null}

            <div className="space-y-3">
              {publishedDrafts.length ? (
                publishedDrafts.map((snapshot) => (
                  <button
                    key={snapshot.id}
                    type="button"
                    onClick={() => loadDraft(snapshot)}
                    className="w-full rounded-[1.3rem] border border-[#00000010] bg-[#fff9f4] px-4 py-4 text-left transition-colors hover:bg-white"
                  >
                    <div className="font-medium text-[#1f1814]">{snapshot.name}</div>
                    <div className="mt-2 text-xs uppercase tracking-[0.16em] text-[#7b6f67]">
                      {new Date(snapshot.savedAt).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </div>
                    <div className="mt-2 text-sm text-[#5d524b]">
                      {FORMAT_OPTIONS.find((option) => option.id === snapshot.editorState.formatId)?.label}
                      {" / "}
                      {STYLE_MODE_OPTIONS.find(
                        (option) => option.id === snapshot.editorState.styleMode,
                      )?.label}
                    </div>
                    {previewHref ? (
                      <div className="mt-3">
                        <Link
                          href={previewHref(snapshot.id)}
                          className="inline-flex rounded-full border border-[#00000012] bg-white/75 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#1f1814] transition-colors hover:bg-white"
                        >
                          Preview this version
                        </Link>
                      </div>
                    ) : null}
                  </button>
                ))
              ) : (
                <div className="rounded-[1.3rem] border border-dashed border-[#00000014] px-4 py-5 text-sm leading-7 text-[#6f625b]">
                  No saved drafts yet. Publish one after you settle on a direction.
                </div>
              )}
            </div>
          </div>
        </section>
        ) : null}
        </div>
      </aside>
    </div>
  );
}

function InspectorTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[1.2rem] border px-3 py-3 text-sm font-semibold transition-colors ${
        active
          ? "border-[#8f4f2e33] bg-[#1f1814] text-[#f9f2ea]"
          : "border-[#00000010] bg-white/72 text-[#1f1814] hover:bg-white"
      }`}
    >
      {label}
    </button>
  );
}

function EditorPageNavigator({
  activeStyle,
  currentIndex,
  idleStyle,
  onSelectPage,
  pages,
}: {
  activeStyle: CSSProperties;
  currentIndex: number;
  idleStyle: CSSProperties;
  onSelectPage: (index: number) => void;
  pages: BookPage[];
}) {
  if (!pages.length) {
    return null;
  }

  return (
    <div className="mt-5 space-y-3 border-t border-black/5 pt-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onSelectPage(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
          className="rounded-full px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          style={idleStyle}
        >
          Previous page
        </button>
        <div className="text-xs uppercase tracking-[0.18em] text-[#7a6e65]">
          Flip through the book without leaving the workspace
        </div>
        <button
          type="button"
          onClick={() => onSelectPage(Math.min(pages.length - 1, currentIndex + 1))}
          disabled={currentIndex === pages.length - 1}
          className="rounded-full px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          style={activeStyle}
        >
          Next page
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {pages.map((page, index) => (
          <button
            key={page.id}
            type="button"
            onClick={() => onSelectPage(index)}
            className="rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em]"
            style={index === currentIndex ? activeStyle : idleStyle}
          >
            {index + 1}. {truncateLabel(page.title)}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChapterDividerPreview({
  chapter,
  fontPreset,
  styleMode,
}: {
  chapter: StoryChapter;
  fontPreset: { body: string; headline: string; accent?: string };
  styleMode: EditorStyleMode;
}) {
  const style =
    STYLE_MODE_OPTIONS.find((entry) => entry.id === styleMode) ?? STYLE_MODE_OPTIONS[0];

  return (
    <section
      className={`rounded-[2rem] border border-[#00000010] px-5 py-6 ${style.shellClass}`}
    >
      <div className="text-[11px] uppercase tracking-[0.22em] text-[#8b5a40]">
        Chapter divider
      </div>
      <h3
        className="mt-3 text-4xl leading-none text-[#201915]"
        style={{ fontFamily: fontPreset.headline }}
      >
        {chapter.title}
      </h3>
      <p
        className="mt-4 max-w-3xl text-sm leading-7 text-[#61554d]"
        style={{ fontFamily: fontPreset.body }}
      >
        {chapter.subtitle}
      </p>
    </section>
  );
}

function EditorSpreadCanvas({
  accent,
  controls,
  fontPreset,
  formatId,
  page,
  pageIndex,
  pagePhotos,
  photoCaptions,
  project,
  selectedPhotoId,
  styleMode,
  onSelectPhoto,
}: {
  accent: string;
  controls: EditorControls;
  fontPreset: { body: string; headline: string; accent?: string };
  formatId: BookDraftFormatId;
  page: BookPage;
  pageIndex: number;
  pagePhotos: PhotoAsset[];
  photoCaptions: Record<string, string>;
  project: Project;
  selectedPhotoId: string;
  styleMode: EditorStyleMode;
  onSelectPhoto: (photoId: string) => void;
}) {
  const spreadType = normalizeSpreadType(page.style);
  const style =
    STYLE_MODE_OPTIONS.find((entry) => entry.id === styleMode) ?? STYLE_MODE_OPTIONS[0];
  const columns =
    controls.density >= 75 ? 4 : controls.density >= 55 ? 3 : controls.density >= 35 ? 2 : 1;
  const supportHeight =
    controls.density >= 70
      ? "min-h-[8.5rem]"
      : controls.density >= 45
        ? "min-h-[10rem]"
        : "min-h-[12rem]";

  const renderPhotoTile = (
    photo: PhotoAsset,
    className = "min-h-[16rem]",
    treatment: "default" | "hero" | "compact" = "default",
  ) => (
    <EditorPhotoTile
      key={photo.id}
      accent={accent}
      caption={photoCaptions[photo.id]}
      className={className}
      fontPreset={fontPreset}
      photo={photo}
      project={project}
      selected={photo.id === selectedPhotoId}
      showDates={controls.showDates}
      showLocations={controls.showLocations}
      treatment={treatment}
      onSelect={() => onSelectPhoto(photo.id)}
    />
  );

  const renderEmptyTile = (
    message: string,
    className = "min-h-[16rem]",
    tone: "default" | "quiet" = "default",
  ) => (
    <EmptyPhotoSlot className={className} tone={tone}>
      {message}
    </EmptyPhotoSlot>
  );

  const renderGrid = (
    photos: PhotoAsset[],
    {
      minHeight = supportHeight,
      maxColumns = columns,
      treatment = "compact" as const,
    }: {
      maxColumns?: number;
      minHeight?: string;
      treatment?: "default" | "hero" | "compact";
    } = {},
  ) => {
    if (!photos.length) {
      return renderEmptyTile(
        "Move more support photos here and the spread will rebalance.",
        minHeight,
        "quiet",
      );
    }

    const columnClass =
      maxColumns <= 1
        ? "grid-cols-1"
        : maxColumns === 2
          ? "md:grid-cols-2"
          : maxColumns === 3
            ? "md:grid-cols-2 xl:grid-cols-3"
            : "md:grid-cols-2 xl:grid-cols-4";

    return (
      <div className={`grid gap-4 ${columnClass}`}>
        {photos.map((photo) => renderPhotoTile(photo, minHeight, treatment))}
      </div>
    );
  };

  const copyPanel = (
    <EditorCopyPanel
      controls={controls}
      fontPreset={fontPreset}
      page={page}
      pageIndex={pageIndex}
      pagePhotos={pagePhotos}
      project={project}
    />
  );

  const leadPhoto = pagePhotos[0];
  const secondaryPhotos = pagePhotos.slice(1);
  const tertiaryPhotos = pagePhotos.slice(2);

  const preview = (() => {
    switch (spreadType) {
      case "hero_full_bleed":
        return (
          <div className="space-y-4">
            {leadPhoto
              ? renderPhotoTile(leadPhoto, "min-h-[28rem] md:min-h-[34rem]", "hero")
              : renderEmptyTile("Pick one dominant image for this hero spread.", "min-h-[28rem]")}
            {secondaryPhotos.length ? renderGrid(secondaryPhotos, { maxColumns: 3 }) : null}
            {copyPanel}
          </div>
        );
      case "hero_support_strip":
        return (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.18fr_0.82fr]">
              <div>
                {leadPhoto
                  ? renderPhotoTile(leadPhoto, "min-h-[26rem] md:min-h-[31rem]", "hero")
                  : renderEmptyTile("Choose a hero image for the opening column.", "min-h-[26rem]")}
              </div>
              <div className="space-y-4">
                {copyPanel}
                {renderGrid(secondaryPhotos, {
                  maxColumns: secondaryPhotos.length >= 3 ? 3 : 2,
                  minHeight: "min-h-[9rem]",
                })}
              </div>
            </div>
          </div>
        );
      case "balanced_two_up":
        return (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              {leadPhoto
                ? renderPhotoTile(leadPhoto, "min-h-[22rem] md:min-h-[26rem]", "hero")
                : renderEmptyTile("Balanced spreads need a first image.", "min-h-[22rem]")}
              {pagePhotos[1]
                ? renderPhotoTile(pagePhotos[1], "min-h-[22rem] md:min-h-[26rem]", "hero")
                : renderEmptyTile("Add a second image or switch to a hero spread.", "min-h-[22rem]", "quiet")}
            </div>
            {tertiaryPhotos.length ? renderGrid(tertiaryPhotos, { maxColumns: 3 }) : null}
            {copyPanel}
          </div>
        );
      case "four_up_grid":
        return (
          <div className="space-y-4">
            {copyPanel}
            {renderGrid(pagePhotos, {
              maxColumns: 2,
              minHeight: controls.density >= 55 ? "min-h-[11rem]" : "min-h-[13rem]",
              treatment: "default",
            })}
          </div>
        );
      case "dense_candid_grid":
        return (
          <div className="space-y-4">
            {copyPanel}
            {renderGrid(pagePhotos, {
              maxColumns: Math.max(columns, 3),
              minHeight: controls.density >= 65 ? "min-h-[8rem]" : "min-h-[9rem]",
              treatment: "compact",
            })}
          </div>
        );
      case "panorama_spread":
        return (
          <div className="space-y-4">
            {leadPhoto
              ? renderPhotoTile(leadPhoto, "min-h-[20rem] md:min-h-[24rem]", "hero")
              : renderEmptyTile("Reserve panoramas for wide scenic images.", "min-h-[20rem]")}
            {secondaryPhotos.length ? renderGrid(secondaryPhotos, { maxColumns: 4 }) : null}
            {copyPanel}
          </div>
        );
      case "text_divider":
        return (
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4">
              <div className="rounded-[1.8rem] border border-[#00000012] bg-white/88 px-5 py-8">
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#8b5a40]">
                  Divider spread
                </div>
                <h3
                  className="mt-3 text-5xl leading-none text-[#1f1814]"
                  style={{ fontFamily: fontPreset.headline }}
                >
                  {page.title}
                </h3>
                <p
                  className="mt-5 text-sm leading-8 text-[#5f544d]"
                  style={{ fontFamily: fontPreset.body }}
                >
                  {buildDisplayCaption(page, pagePhotos, project, controls.captionTone)}
                </p>
              </div>
              {controls.showMaps ? (
                <MapTimelineCard project={project} pagePhotos={pagePhotos} />
              ) : null}
            </div>
            <div className="space-y-4">
              {leadPhoto
                ? renderPhotoTile(leadPhoto, "min-h-[24rem]", "hero")
                : renderEmptyTile("Optional supporting image only.", "min-h-[24rem]", "quiet")}
            </div>
          </div>
        );
      case "photo_journal":
        return (
          <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="space-y-4">
              {copyPanel}
              {controls.showHandwrittenNotes ? (
                <div
                  className="rounded-[1.5rem] border border-[#00000012] bg-[#fff7ec] px-4 py-4 text-sm leading-7 text-[#6a5647]"
                  style={{ fontFamily: fontPreset.accent ?? fontPreset.body }}
                >
                  Handwritten note block: add a quick emotional detail or what made
                  the moment matter.
                </div>
              ) : null}
            </div>
            <div className="space-y-4">
              {leadPhoto
                ? renderPhotoTile(leadPhoto, "min-h-[22rem] md:min-h-[28rem]", "hero")
                : renderEmptyTile("Journal spreads still need one supporting frame.", "min-h-[22rem]")}
              {pagePhotos[1]
                ? renderPhotoTile(pagePhotos[1], "min-h-[11rem]", "default")
                : null}
            </div>
          </div>
        );
      case "memorabilia_spread":
        return (
          <div className="space-y-4">
            {copyPanel}
            <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-4">
                {leadPhoto
                  ? renderPhotoTile(leadPhoto, "min-h-[20rem]", "hero")
                  : renderEmptyTile("Use one image to anchor the memorabilia page.", "min-h-[20rem]")}
                {controls.showMemorabilia ? <MemorabiliaStrip photos={secondaryPhotos} /> : null}
              </div>
              <div>{renderGrid(secondaryPhotos, { maxColumns: 2, minHeight: "min-h-[9rem]" })}</div>
            </div>
          </div>
        );
      case "pattern_repetition":
        return (
          <div className="space-y-4">
            {copyPanel}
            {renderGrid(pagePhotos, {
              maxColumns: 3,
              minHeight: "min-h-[12rem]",
              treatment: "default",
            })}
          </div>
        );
      case "burst_sequence":
        return (
          <div className="space-y-4">
            {copyPanel}
            <div className="grid gap-4 md:grid-cols-3">
              {pagePhotos.length
                ? pagePhotos.map((photo, index) =>
                    renderPhotoTile(
                      photo,
                      index === 0 ? "min-h-[14rem] md:col-span-3" : "min-h-[10rem]",
                      index === 0 ? "hero" : "compact",
                    ),
                  )
                : renderEmptyTile("Burst spreads need a short run of repeated frames.", "min-h-[14rem]")}
            </div>
          </div>
        );
      case "map_timeline":
        return (
          <div className="grid gap-4 lg:grid-cols-[0.88fr_1.12fr]">
            <div className="space-y-4">
              <MapTimelineCard project={project} pagePhotos={pagePhotos} />
              {copyPanel}
            </div>
            <div className="space-y-4">
              {leadPhoto
                ? renderPhotoTile(leadPhoto, "min-h-[22rem] md:min-h-[28rem]", "hero")
                : renderEmptyTile("Context spreads can hold a single travel image.", "min-h-[22rem]")}
              {secondaryPhotos.length ? renderGrid(secondaryPhotos, { maxColumns: 2 }) : null}
            </div>
          </div>
        );
      default:
        return (
          <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
            <div>
              {leadPhoto
                ? renderPhotoTile(leadPhoto, "min-h-[24rem] md:min-h-[29rem]", "hero")
                : renderEmptyTile("Pick a lead image to start shaping this spread.", "min-h-[24rem]")}
            </div>
            <div className="space-y-4">
              {copyPanel}
              {renderGrid(secondaryPhotos, { maxColumns: 2 })}
            </div>
          </div>
        );
    }
  })();

  const canvasStyle = {
    boxShadow:
      styleMode === "clean_modern"
        ? "0 12px 32px rgba(31, 24, 20, 0.05)"
        : "0 18px 48px rgba(31, 24, 20, 0.08)",
    maxWidth: formatId === "11x8.5-landscape" ? "54rem" : undefined,
  } satisfies CSSProperties;

  return (
    <div
      className="relative mx-auto w-full overflow-hidden rounded-[1.8rem] border border-white/50 bg-white/82 p-4"
      style={canvasStyle}
    >
      <PrintPreviewGuides formatId={formatId} mode={controls.printPreviewMode} />
      <div className="relative z-10 space-y-4">{preview}</div>
      <div className="mt-4 rounded-[1.2rem] border border-[#00000010] bg-[#fffaf5] px-4 py-3 text-xs uppercase tracking-[0.18em] text-[#7e7067]">
        {style.label} / {getSpreadLabel(spreadType)} / density {controls.density}
      </div>
    </div>
  );
}

function EditorCopyPanel({
  controls,
  fontPreset,
  page,
  pageIndex,
  pagePhotos,
  project,
}: {
  controls: EditorControls;
  fontPreset: { body: string; headline: string; accent?: string };
  page: BookPage;
  pageIndex: number;
  pagePhotos: PhotoAsset[];
  project: Project;
}) {
  const copy = buildDisplayCaption(page, pagePhotos, project, controls.captionTone);

  return (
    <div className="rounded-[1.7rem] border border-[#00000010] bg-white/90 px-5 py-5 shadow-[0_14px_30px_rgba(49,33,22,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.2em] text-[#8b5a40]">
          Spread {pageIndex + 1} / {page.storyBeat.replaceAll("_", " ")}
        </div>
        <EditorTag
          className={
            page.copyStatus === "confirmed"
              ? "bg-[#dfeee7] text-[#2d624b]"
              : "bg-[#f2ebe4] text-[#6f625b]"
          }
        >
          {page.copyStatus === "confirmed" ? "copy confirmed" : "prefilled copy"}
        </EditorTag>
      </div>
      <h3
        className="mt-3 text-3xl leading-none text-[#1f1814]"
        style={{ fontFamily: fontPreset.headline }}
      >
        {page.title}
      </h3>
      <p
        className="mt-4 text-sm leading-8 text-[#5d524b]"
        style={{ fontFamily: fontPreset.body }}
      >
        {copy}
      </p>
      <div className="mt-4 rounded-[1.2rem] border border-[#0000000d] bg-[#faf4ee] px-4 py-4 text-sm leading-7 text-[#62574f]">
        {page.curationNote}
      </div>
      {(controls.showDates || controls.showLocations) && pagePhotos.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {pagePhotos.slice(0, 4).map((photo) => (
            <EditorTag key={photo.id} className="bg-[#f7efe8] text-[#7b6f67]">
              {buildPhotoMetaLine(photo, project, controls.showDates, controls.showLocations)}
            </EditorTag>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EditorPhotoTile({
  accent,
  caption,
  className = "min-h-[16rem]",
  fontPreset,
  photo,
  project,
  selected,
  showDates,
  showLocations,
  treatment = "default",
  onSelect,
}: {
  accent: string;
  caption?: string;
  className?: string;
  fontPreset: { body: string; headline: string; accent?: string };
  photo: PhotoAsset;
  project: Project;
  selected: boolean;
  showDates: boolean;
  showLocations: boolean;
  treatment?: "default" | "hero" | "compact";
  onSelect: () => void;
}) {
  const titleClass =
    treatment === "compact"
      ? "text-[0.95rem]"
      : treatment === "hero"
        ? "text-lg"
        : "text-base";
  const footerPadding =
    treatment === "compact"
      ? "px-3 py-2.5"
      : treatment === "hero"
        ? "px-4 py-4"
        : "px-4 py-3";
  const showSecondaryCopy = treatment !== "compact";
  const captionText =
    caption?.trim() ||
    buildPhotoMetaLine(photo, project, showDates, showLocations) ||
    "Add a photo caption";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group grid w-full overflow-hidden rounded-[1.8rem] border bg-[#fffdf9] text-left transition-transform hover:-translate-y-0.5 [grid-template-rows:minmax(0,1fr)_auto] ${className} ${selected ? "border-[#8f4f2e66] shadow-[0_0_0_3px_rgba(143,79,46,0.16)]" : "border-white/45"}`}
      style={{
        boxShadow: `inset 0 0 0 1px ${accent}22`,
      }}
    >
      <div className="relative min-h-0 overflow-hidden bg-[#e9dfd3]">
        {photo.imageUri ? (
          <>
            <img
              src={photo.imageUri}
              alt={photo.title}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.015]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(24,17,12,0.05),rgba(24,17,12,0.18))]" />
          </>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.95),rgba(234,225,216,0.98))]" />
        )}
        <div className="absolute left-3 top-3 rounded-full border border-white/45 bg-[rgba(18,12,9,0.42)] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-[#f9f3ed] backdrop-blur-sm">
          {photo.orientation}
        </div>
        {selected ? (
          <div className="absolute right-3 top-3 rounded-full border border-[#fff0e6] bg-[#fff7f1] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8f4f2e]">
            selected
          </div>
        ) : null}
      </div>

      <div
        className={`border-t border-[#0000000d] bg-[linear-gradient(180deg,rgba(255,251,247,0.98),rgba(246,238,231,0.98))] ${footerPadding}`}
      >
        <div className="min-w-0">
          <div
            className={`${titleClass} font-semibold text-[#1f1814]`}
            style={{ fontFamily: fontPreset.headline }}
          >
            {photo.title}
          </div>
          {showSecondaryCopy ? (
            <div
              className="mt-1.5 text-[11px] leading-5 text-[#6f635b]"
              style={{ fontFamily: fontPreset.body }}
            >
              {captionText}
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function MapTimelineCard({
  pagePhotos,
  project,
}: {
  pagePhotos: PhotoAsset[];
  project: Project;
}) {
  const location =
    pagePhotos
      .map((photo) => photo.locationLabel)
      .find((value): value is string => Boolean(value)) ?? project.title;
  const firstDate =
    pagePhotos[0]?.capturedAt ?? `${project.startDate}T12:00:00.000Z`;
  const lastDate =
    pagePhotos.at(-1)?.capturedAt ?? `${project.endDate}T12:00:00.000Z`;

  return (
    <div className="rounded-[1.6rem] border border-[#00000010] bg-[#f8f1ea] px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.2em] text-[#8b5a40]">
        Map / timeline
      </div>
      <div className="mt-3 text-xl font-semibold text-[#1f1814]">{location}</div>
      <div className="mt-2 text-sm leading-7 text-[#61554d]">
        {formatPhotoDate(project, firstDate)}
        {" -> "}
        {formatPhotoDate(project, lastDate)}
      </div>
      <div className="mt-4 h-24 rounded-[1.2rem] border border-dashed border-[#c9b5a3] bg-[linear-gradient(180deg,rgba(255,255,255,0.65),rgba(247,236,225,0.78))]" />
    </div>
  );
}

function MemorabiliaStrip({ photos }: { photos: PhotoAsset[] }) {
  if (!photos.length) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-[#00000014] bg-white/74 px-4 py-4 text-sm leading-7 text-[#6a5d55]">
        Add food, details, or tickets here and the spread will read more like a
        premium keepsake than a generic gallery.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {photos.slice(0, 4).map((photo) => (
        <div
          key={photo.id}
          className="rounded-[1.4rem] border border-[#00000010] bg-white/82 px-4 py-4"
        >
          <div className="text-sm font-semibold text-[#1f1814]">{photo.title}</div>
          <div className="mt-2 text-xs uppercase tracking-[0.16em] text-[#7b6f67]">
            {photo.locationLabel ?? "Memorabilia note"}
          </div>
        </div>
      ))}
    </div>
  );
}

function PrintPreviewGuides({
  formatId,
  mode,
}: {
  formatId: BookDraftFormatId;
  mode: PrintPreviewMode;
}) {
  if (mode === "clean") {
    return null;
  }

  const isLandscape = formatId === "11x8.5-landscape";

  return (
    <div className="pointer-events-none absolute inset-0 z-20 rounded-[1.8rem]">
      {mode === "bleed" ? (
        <div className="absolute inset-[1.8%] rounded-[1.55rem] border border-dashed border-[#d37d4f66]" />
      ) : null}
      <div className="absolute inset-[6%] rounded-[1.3rem] border border-dashed border-[#8f4f2e44]" />
      <div
        className={`absolute bottom-[6%] top-[6%] left-1/2 w-px -translate-x-1/2 ${isLandscape ? "bg-[#8f4f2e3d]" : "bg-[#8f4f2e44]"}`}
      />
      <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-[#ecd0bf] bg-[#fff7f1] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8f4f2e]">
        {mode === "bleed" ? "Bleed + safe preview" : "Print-safe preview"}
      </div>
    </div>
  );
}

function EmptyPhotoSlot({
  children,
  className,
  tone = "default",
}: {
  children: ReactNode;
  className: string;
  tone?: "default" | "quiet";
}) {
  return (
    <div
      className={`flex items-center justify-center rounded-[1.8rem] border border-dashed px-6 text-center text-sm leading-7 ${tone === "quiet" ? "border-[#00000014] bg-white/54 text-[#776b63]" : "border-[#00000018] bg-white/62 text-[#6f625b]"} ${className}`}
    >
      {children}
    </div>
  );
}

function SelectField({
  helper,
  label,
  onSelect,
  options,
  selectedId,
}: {
  helper: string;
  label: string;
  onSelect: (id: string) => void;
  options: Array<{ helper: string; id: string; label: string }>;
  selectedId: string;
}) {
  const selectedOption =
    options.find((option) => option.id === selectedId) ?? options[0];

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs uppercase tracking-[0.18em] text-[#7a6e65]">{label}</div>
        <div className="mt-1 text-sm leading-6 text-[#6a5f58]">{helper}</div>
      </div>
      <div className="space-y-2">
        <div className="relative">
          <select
            value={selectedId}
            onChange={(event) => onSelect(event.target.value)}
            className="w-full appearance-none rounded-[1.2rem] border border-[#00000012] bg-[#fffaf5] px-4 py-3 pr-12 text-sm font-medium text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
          >
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[#7a6e65]">
            ▾
          </span>
        </div>
        {selectedOption ? (
          <div className="rounded-[1rem] border border-[#0000000d] bg-[#fff9f4] px-4 py-3 text-sm text-[#6a5f58]">
            {selectedOption.helper}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToggleField({
  checked,
  helper,
  label,
  onChange,
}: {
  checked: boolean;
  helper: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-[1.2rem] border border-[#00000010] bg-[#fff9f4] px-4 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-[#c9b2a0] text-[#8f4f2e] focus:ring-[#8f4f2e44]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[#1f1814]">{label}</span>
        <span className="mt-1 block text-sm leading-6 text-[#675c55]">{helper}</span>
      </span>
    </label>
  );
}

function RangeField({
  helper,
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  helper: string;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-[#7a6e65]">{label}</div>
          <div className="mt-1 text-sm leading-6 text-[#6a5f58]">{helper}</div>
        </div>
        <div className="rounded-full border border-[#00000010] bg-[#fff9f4] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#7c6f67]">
          {value}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[#8f4f2e]"
      />
    </div>
  );
}

function EditorStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.4rem] border border-[#00000010] bg-white/74 px-4 py-4">
      <div className="text-xl font-semibold text-[#1f1814]">{value}</div>
      <div className="mt-2 text-xs uppercase tracking-[0.18em] text-[#7b6f67]">
        {label}
      </div>
    </div>
  );
}

function EditorTag({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${className}`}
    >
      {children}
    </span>
  );
}

function createInitialEditorState(project: Project): EditorState {
  const normalizedProject = normalizeProjectDraftState(project);
  const draftEditorState =
    normalizedProject.draftEditorState ?? buildDefaultDraftEditorState(normalizedProject);

  return {
    ...draftEditorState,
    fontPresetId: (draftEditorState.fontPresetId as FontPresetId) ?? "gallery",
    project: cloneProject({
      ...normalizedProject,
      bookDraft: {
        ...normalizedProject.bookDraft,
        format: getBookDraftFormatLabel(draftEditorState.formatId),
      },
    }),
  };
}

function cloneProject(project: Project) {
  return JSON.parse(JSON.stringify(project)) as Project;
}

function findPhotoPageId(project: Project, photoId: string) {
  return (
    project.bookDraft.pages.find((page) => page.photoIds.includes(photoId))?.id ??
    project.bookDraft.pages[0]?.id ??
    ""
  );
}

function getPagePhotos(project: Project, page: BookPage) {
  return page.photoIds
    .map((photoId) => project.photos.find((photo) => photo.id === photoId))
    .filter((photo): photo is PhotoAsset => Boolean(photo));
}

function buildDisplayCaption(
  page: BookPage,
  photos: PhotoAsset[],
  project: Project,
  tone: EditorCaptionTone,
) {
  if (page.copySource === "manual" || page.copyStatus === "confirmed") {
    return page.caption;
  }

  const leadPhoto = photos[0];
  if (!leadPhoto) {
    return page.caption;
  }

  const where = leadPhoto.locationLabel || project.title;
  const when = formatPhotoDate(project, leadPhoto.capturedAt);
  const who = getPeopleLabel(project, photos);
  const why = firstSentence(page.caption) || page.curationNote;

  switch (tone) {
    case "factual":
      return `${where}. ${when}. ${who}. ${why}`;
    case "reflective":
      return `${when} in ${where} became one of the quieter anchors of the book. ${why}`;
    case "playful":
      return `${where}, ${when}, and a little bit of chaos. ${who} made the moment memorable. ${why}`;
    case "warm":
    default:
      return `${where} on ${when} with ${who}. ${why}`;
  }
}

function buildPhotoMetaLine(
  photo: PhotoAsset,
  project: Project,
  showDates: boolean,
  showLocations: boolean,
) {
  const parts: string[] = [];

  if (showLocations && photo.locationLabel) {
    parts.push(photo.locationLabel);
  }

  if (showDates) {
    parts.push(formatPhotoDate(project, photo.capturedAt));
  }

  return parts.join(" / ") || photo.orientation;
}

function formatPhotoDate(project: Project, capturedAt: string) {
  return new Date(capturedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: project.timezone,
  });
}

function getPeopleLabel(project: Project, photos: PhotoAsset[]) {
  const memberNames = [
    ...new Set(
      photos.flatMap((photo) =>
        photo.peopleIds
          .map((personId) => project.members.find((member) => member.id === personId)?.name)
          .filter((name): name is string => Boolean(name)),
      ),
    ),
  ];

  if (!memberNames.length) {
    return "the two of you";
  }

  if (memberNames.length === 1) {
    return memberNames[0];
  }

  if (memberNames.length === 2) {
    return `${memberNames[0]} and ${memberNames[1]}`;
  }

  return `${memberNames[0]} and company`;
}

function getSpreadLabel(style: PageLayoutStyle | ApprovedSpreadType) {
  const normalized =
    APPROVED_SPREAD_LIBRARY.find((entry) => entry.id === style) ??
    APPROVED_SPREAD_LIBRARY.find(
      (entry) => entry.id === normalizeSpreadType(style as PageLayoutStyle),
    );

  return normalized?.label ?? sentenceCase(String(style).replaceAll("_", " "));
}

function sentenceCase(value: string) {
  return value ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}` : value;
}

function firstSentence(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "";
  }

  const match = trimmed.match(/^(.+?[.!?])(?:\s|$)/);
  return match?.[1] ?? trimmed;
}

function truncateLabel(value: string) {
  return value.length > 24 ? `${value.slice(0, 24)}...` : value;
}
