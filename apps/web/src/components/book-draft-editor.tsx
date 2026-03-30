"use client";

import type {
  BookPage,
  PageLayoutStyle,
  PhotoAsset,
  Project,
} from "@photo-book-maker/core";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import { FONT_PRESETS, type FontPresetId } from "@/lib/font-presets";

type DraftFormatId =
  | "8x8-square"
  | "10x10-square"
  | "12x12-square"
  | "11x8.5-landscape";
type DraftStyleId = "editorial" | "minimal" | "romance" | "adventure";

type EditorState = {
  fontPresetId: FontPresetId;
  formatId: DraftFormatId;
  photoCaptions: Record<string, string>;
  project: Project;
  styleId: DraftStyleId;
};

type PublishedDraftSnapshot = EditorState & {
  id: string;
  name: string;
  savedAt: string;
};

const FORMAT_OPTIONS: Array<{
  helper: string;
  id: DraftFormatId;
  label: string;
  maxWidth: string;
}> = [
  {
    id: "8x8-square",
    label: "8 x 8 square",
    helper: "Compact keepsake",
    maxWidth: "34rem",
  },
  {
    id: "10x10-square",
    label: "10 x 10 square",
    helper: "Classic gift book",
    maxWidth: "40rem",
  },
  {
    id: "12x12-square",
    label: "12 x 12 square",
    helper: "Premium coffee table",
    maxWidth: "46rem",
  },
  {
    id: "11x8.5-landscape",
    label: "11 x 8.5 landscape",
    helper: "Travel lookbook",
    maxWidth: "56rem",
  },
];

const STYLE_OPTIONS: Array<{
  chipClass: string;
  description: string;
  id: DraftStyleId;
  label: string;
  shellClass: string;
}> = [
  {
    id: "editorial",
    label: "Editorial",
    description: "Warm margins and gallery pacing.",
    shellClass:
      "bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,238,231,0.95))]",
    chipClass: "bg-[#f7dfcf] text-[#8f4f2e]",
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Sharper white space and cleaner trim.",
    shellClass:
      "bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(245,245,243,0.96))]",
    chipClass: "bg-[#e9ecef] text-[#495057]",
  },
  {
    id: "romance",
    label: "Romance",
    description: "Softer blush palette and lighter contrast.",
    shellClass:
      "bg-[linear-gradient(180deg,rgba(255,250,252,0.98),rgba(245,231,234,0.95))]",
    chipClass: "bg-[#f4dde5] text-[#8e4d5e]",
  },
  {
    id: "adventure",
    label: "Adventure",
    description: "Richer tone and stronger outdoor contrast.",
    shellClass:
      "bg-[linear-gradient(180deg,rgba(252,249,244,0.98),rgba(232,223,207,0.96))]",
    chipClass: "bg-[#e7dbc3] text-[#6b5432]",
  },
];

const PAGE_STYLE_OPTIONS: PageLayoutStyle[] = [
  "hero",
  "full_bleed",
  "balanced",
  "diptych",
  "chapter",
  "mosaic",
  "collage",
  "recap",
  "closing",
];

export function BookDraftEditor({ project }: { project: Project }) {
  const [editorState, setEditorState] = useState<EditorState>(() =>
    createInitialEditorState(project),
  );
  const [publishedDrafts, setPublishedDrafts] = useState<PublishedDraftSnapshot[]>([]);
  const [draftName, setDraftName] = useState(`${project.title} - Curated edit`);
  const [selectedPageId, setSelectedPageId] = useState(
    project.bookDraft.pages[0]?.id ?? "",
  );
  const [selectedPhotoId, setSelectedPhotoId] = useState(
    project.bookDraft.pages[0]?.photoIds[0] ?? "",
  );
  const [publishMessage, setPublishMessage] = useState<string | null>(null);

  useEffect(() => {
    const workingDraft = readDraftStorage<EditorState>(getWorkingDraftKey(project.id));
    const savedDrafts =
      readDraftStorage<PublishedDraftSnapshot[]>(getPublishedDraftsKey(project.id)) ?? [];

    if (workingDraft?.project?.id === project.id) {
      setEditorState(workingDraft);
    }

    setPublishedDrafts(savedDrafts);
  }, [project.id]);

  useEffect(() => {
    if (!selectedPageId) {
      const firstPage = editorState.project.bookDraft.pages[0];
      if (firstPage) {
        setSelectedPageId(firstPage.id);
        setSelectedPhotoId(firstPage.photoIds[0] ?? "");
      }
      return;
    }

    const selectedPage = editorState.project.bookDraft.pages.find(
      (page) => page.id === selectedPageId,
    );

    if (!selectedPage) {
      const firstPage = editorState.project.bookDraft.pages[0];
      if (firstPage) {
        setSelectedPageId(firstPage.id);
        setSelectedPhotoId(firstPage.photoIds[0] ?? "");
      }
      return;
    }

    if (selectedPhotoId && selectedPage.photoIds.includes(selectedPhotoId)) {
      return;
    }

    setSelectedPhotoId(selectedPage.photoIds[0] ?? "");
  }, [editorState.project.bookDraft.pages, selectedPageId, selectedPhotoId]);

  useEffect(() => {
    writeDraftStorage(getWorkingDraftKey(project.id), editorState);
  }, [editorState, project.id]);

  useEffect(() => {
    writeDraftStorage(getPublishedDraftsKey(project.id), publishedDrafts);
  }, [publishedDrafts, project.id]);

  const selectedPage =
    editorState.project.bookDraft.pages.find((page) => page.id === selectedPageId) ??
    editorState.project.bookDraft.pages[0];
  const selectedPhoto = editorState.project.photos.find(
    (photo) => photo.id === selectedPhotoId,
  );
  const selectedFormat =
    FORMAT_OPTIONS.find((format) => format.id === editorState.formatId) ??
    FORMAT_OPTIONS[2];
  const selectedStyle =
    STYLE_OPTIONS.find((style) => style.id === editorState.styleId) ?? STYLE_OPTIONS[0];
  const selectedFont =
    FONT_PRESETS.find((font) => font.id === editorState.fontPresetId) ?? FONT_PRESETS[0];
  const selectedTheme =
    editorState.project.bookThemes.find(
      (theme) => theme.id === editorState.project.selectedThemeId,
    ) ?? editorState.project.bookThemes[0];

  function updatePage(pageId: string, updater: (page: BookPage) => BookPage) {
    setEditorState((current) => ({
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

  function handlePhotoMove(photoId: string, targetPageId: string) {
    setEditorState((current) => {
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
  }

  function publishDraft() {
    const snapshot: PublishedDraftSnapshot = {
      ...editorState,
      id: globalThis.crypto?.randomUUID?.() ?? `draft-${Date.now()}`,
      name:
        draftName.trim() ||
        `${editorState.project.title} - ${new Date().toLocaleTimeString()}`,
      savedAt: new Date().toISOString(),
    };

    setPublishedDrafts((current) => [snapshot, ...current]);
    setPublishMessage(`Published ${snapshot.name}`);
  }

  function loadDraft(snapshot: PublishedDraftSnapshot) {
    setEditorState(snapshot);
    setSelectedPageId(snapshot.project.bookDraft.pages[0]?.id ?? "");
    setSelectedPhotoId(snapshot.project.bookDraft.pages[0]?.photoIds[0] ?? "");
    setDraftName(snapshot.name);
    setPublishMessage(`Loaded ${snapshot.name}`);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_22rem]">
      <div className="space-y-6">
        <section className="surface-strong rounded-[2.3rem] px-6 py-6 md:px-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <div className="eyebrow">Draft editor</div>
              <h2 className="display mt-2 text-4xl text-[#1f1814] sm:text-5xl">
                Build alternate versions before you publish.
              </h2>
              <p className="mt-3 text-sm leading-7 text-[#5d524b]">
                Choose trim size, visual style, and font direction. Click any photo
                in the spread to move it, adjust its photo-specific caption, or swap
                its placement across pages.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/projects/${project.id}`}
                className="rounded-full border border-[#1f18141f] bg-white/72 px-4 py-2 text-sm font-medium text-[#1f1814] transition-colors hover:bg-white"
              >
                Back to proof board
              </Link>
              <Link
                href={`/projects/${project.id}/preview`}
                className="rounded-full border border-[#1f18141f] bg-[#1f1814] px-4 py-2 text-sm font-medium text-[#f8efe7] transition-colors hover:bg-[#302721]"
              >
                Open clean preview
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <EditorStat label="Format" value={selectedFormat.label} />
            <EditorStat label="Style" value={selectedStyle.label} />
            <EditorStat label="Font" value={selectedFont.label} />
            <EditorStat label="Published drafts" value={`${publishedDrafts.length}`} />
          </div>
        </section>

        {editorState.project.bookDraft.pages.map((page, index) => {
          const pagePhotos = getPagePhotos(editorState.project, page);
          const isSelectedPage = page.id === selectedPage?.id;

          return (
            <article
              key={page.id}
              className={`rounded-[2.2rem] border p-5 shadow-[0_18px_48px_rgba(40,28,18,0.08)] transition-colors md:p-6 ${isSelectedPage ? "border-[#8f4f2e33] bg-[#fffaf5]" : "border-[#00000012] bg-white/88"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#00000010] pb-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-[#7a6d64]">
                    Spread {index + 1}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPageId(page.id)}
                    className="mt-2 text-left text-2xl font-semibold text-[#1f1814]"
                    style={{ fontFamily: selectedFont.headline }}
                  >
                    {page.title}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <EditorTag className={selectedStyle.chipClass}>
                    {page.style.replaceAll("_", " ")}
                  </EditorTag>
                  <EditorTag className="bg-[#f2ebe4] text-[#6f625b]">
                    {page.storyBeat.replaceAll("_", " ")}
                  </EditorTag>
                  <EditorTag
                    className={
                      page.copyStatus === "confirmed"
                        ? "bg-[#dfeee7] text-[#2d624b]"
                        : "bg-[#f5e9dc] text-[#8f5a33]"
                    }
                  >
                    {page.copyStatus === "confirmed" ? "copy confirmed" : "needs review"}
                  </EditorTag>
                </div>
              </div>

              <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_20rem]">
                <div
                  className={`mx-auto w-full overflow-hidden rounded-[2rem] border border-[#00000010] p-4 md:p-5 ${selectedStyle.shellClass}`}
                  style={{ maxWidth: selectedFormat.maxWidth }}
                >
                  <EditorSpreadCanvas
                    accent={selectedTheme.accent}
                    fontPreset={selectedFont}
                    formatId={selectedFormat.id}
                    page={page}
                    pagePhotos={pagePhotos}
                    photoCaptions={editorState.photoCaptions}
                    selectedPhotoId={selectedPhotoId}
                    styleId={selectedStyle.id}
                    onSelectPhoto={(photoId) => {
                      setSelectedPageId(page.id);
                      setSelectedPhotoId(photoId);
                    }}
                  />
                </div>

                <div className="space-y-4">
                  <div className="rounded-[1.6rem] border border-[#00000010] bg-[#fbf6f1] p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-[#8b5a40]">
                      Spread copy
                    </div>
                    <h3
                      className="mt-3 text-3xl leading-none text-[#1f1814]"
                      style={{ fontFamily: selectedFont.headline }}
                    >
                      {page.title}
                    </h3>
                    <p
                      className="mt-4 text-sm leading-7 text-[#5d524b]"
                      style={{ fontFamily: selectedFont.body }}
                    >
                      {page.caption}
                    </p>
                  </div>

                  <div className="rounded-[1.6rem] border border-[#00000010] bg-white/82 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-[#7a6e65]">
                      Photos on this spread
                    </div>
                    <div className="mt-3 grid gap-3">
                      {pagePhotos.map((photo) => (
                        <button
                          key={photo.id}
                          type="button"
                          onClick={() => {
                            setSelectedPageId(page.id);
                            setSelectedPhotoId(photo.id);
                          }}
                          className={`rounded-[1.2rem] border px-4 py-3 text-left transition-colors ${photo.id === selectedPhotoId ? "border-[#8f4f2e44] bg-[#fff1e6]" : "border-[#00000010] bg-[#fff9f4]"}`}
                        >
                          <div className="font-medium text-[#211a16]">{photo.title}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[#7b6f67]">
                            {editorState.photoCaptions[photo.id] || photo.locationLabel || "Photo note"}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
        <section className="rounded-[2rem] border border-[#00000012] bg-white/92 p-5">
          <div className="eyebrow">Book controls</div>
          <div className="mt-4 space-y-4">
            <SelectField
              label="Book size"
              helper="Switch the trim before saving a new draft."
              options={FORMAT_OPTIONS.map((option) => ({
                helper: option.helper,
                id: option.id,
                label: option.label,
              }))}
              selectedId={editorState.formatId}
              onSelect={(formatId) =>
                setEditorState((current) => ({ ...current, formatId: formatId as DraftFormatId }))
              }
            />
            <SelectField
              label="Book style"
              helper="Change the overall art direction."
              options={STYLE_OPTIONS.map((option) => ({
                helper: option.description,
                id: option.id,
                label: option.label,
              }))}
              selectedId={editorState.styleId}
              onSelect={(styleId) =>
                setEditorState((current) => ({ ...current, styleId: styleId as DraftStyleId }))
              }
            />
            <SelectField
              label="Font direction"
              helper="Preview the same draft with a different voice."
              options={FONT_PRESETS.map((option) => ({
                helper: option.description,
                id: option.id,
                label: option.label,
              }))}
              selectedId={editorState.fontPresetId}
              onSelect={(fontPresetId) =>
                setEditorState((current) => ({
                  ...current,
                  fontPresetId: fontPresetId as FontPresetId,
                }))
              }
            />
          </div>
        </section>

        {selectedPage ? (
          <section className="rounded-[2rem] border border-[#00000012] bg-white/92 p-5">
            <div className="eyebrow">Selected spread</div>
            <div className="mt-4 space-y-4">
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
                  value={selectedPage.caption}
                  onChange={(event) =>
                    updatePage(selectedPage.id, (page) => ({
                      ...page,
                      caption: event.target.value,
                      copySource: "manual",
                    }))
                  }
                  rows={5}
                  className="mt-2 w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm leading-7 text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
                />
              </label>

              <label className="block">
                <span className="text-xs uppercase tracking-[0.18em] text-[#7a6e65]">
                  Spread layout
                </span>
                <select
                  value={selectedPage.style}
                  onChange={(event) =>
                    updatePage(selectedPage.id, (page) => ({
                      ...page,
                      style: event.target.value as PageLayoutStyle,
                    }))
                  }
                  className="mt-2 w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
                >
                  {PAGE_STYLE_OPTIONS.map((pageStyle) => (
                    <option key={pageStyle} value={pageStyle}>
                      {pageStyle.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-3 rounded-[1.1rem] border border-[#00000010] bg-[#fff9f4] px-4 py-3 text-sm text-[#5d524b]">
                <input
                  type="checkbox"
                  checked={selectedPage.copyStatus === "confirmed"}
                  onChange={(event) =>
                    updatePage(selectedPage.id, (page) => ({
                      ...page,
                      copyStatus: event.target.checked ? "confirmed" : "prefilled",
                    }))
                  }
                  className="h-4 w-4 rounded border-[#00000030]"
                />
                Mark spread copy as confirmed
              </label>
            </div>
          </section>
        ) : null}

        {selectedPhoto ? (
          <section className="rounded-[2rem] border border-[#00000012] bg-white/92 p-5">
            <div className="eyebrow">Selected photo</div>
            <div className="mt-4 space-y-4">
              <div className="rounded-[1.4rem] border border-[#00000010] bg-[#fbf6f1] p-4">
                <div className="text-lg font-semibold text-[#1f1814]">
                  {selectedPhoto.title}
                </div>
                <div className="mt-2 text-sm leading-7 text-[#5d524b]">
                  {selectedPhoto.locationLabel ?? "Location still needs confirmation."}
                </div>
              </div>

              <label className="block">
                <span className="text-xs uppercase tracking-[0.18em] text-[#7a6e65]">
                  Photo caption
                </span>
                <textarea
                  value={editorState.photoCaptions[selectedPhoto.id] ?? ""}
                  onChange={(event) =>
                    setEditorState((current) => ({
                      ...current,
                      photoCaptions: {
                        ...current.photoCaptions,
                        [selectedPhoto.id]: event.target.value,
                      },
                    }))
                  }
                  rows={4}
                  className="mt-2 w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm leading-7 text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
                />
              </label>

              <label className="block">
                <span className="text-xs uppercase tracking-[0.18em] text-[#7a6e65]">
                  Move photo to spread
                </span>
                <select
                  value={findPhotoPageId(editorState.project, selectedPhoto.id)}
                  onChange={(event) => handlePhotoMove(selectedPhoto.id, event.target.value)}
                  className="mt-2 w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
                >
                  {editorState.project.bookDraft.pages.map((page, index) => (
                    <option key={page.id} value={page.id}>
                      Spread {index + 1} - {page.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        ) : null}

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
              onClick={publishDraft}
              className="w-full rounded-full bg-[#1f1814] px-4 py-3 text-sm font-semibold text-[#f8efe7] transition-colors hover:bg-[#302721]"
            >
              Publish draft
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
                      {FORMAT_OPTIONS.find((option) => option.id === snapshot.formatId)?.label} -{" "}
                      {STYLE_OPTIONS.find((option) => option.id === snapshot.styleId)?.label}
                    </div>
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
      </aside>
    </div>
  );
}

function EditorSpreadCanvas({
  accent,
  fontPreset,
  formatId,
  page,
  pagePhotos,
  photoCaptions,
  selectedPhotoId,
  styleId,
  onSelectPhoto,
}: {
  accent: string;
  fontPreset: { body: string; headline: string };
  formatId: DraftFormatId;
  page: BookPage;
  pagePhotos: PhotoAsset[];
  photoCaptions: Record<string, string>;
  selectedPhotoId: string;
  styleId: DraftStyleId;
  onSelectPhoto: (photoId: string) => void;
}) {
  const copyCard = (
    <div className="rounded-[1.6rem] border border-white/50 bg-white/82 p-5 shadow-[0_14px_30px_rgba(49,33,22,0.08)]">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[#8b5a40]">
        {page.storyBeat.replaceAll("_", " ")}
      </div>
      <h3
        className="mt-3 text-3xl leading-none text-[#1f1814]"
        style={{ fontFamily: fontPreset.headline }}
      >
        {page.title}
      </h3>
      <p
        className="mt-4 text-sm leading-7 text-[#5d524b]"
        style={{ fontFamily: fontPreset.body }}
      >
        {page.caption}
      </p>
    </div>
  );

  const canvasStyle = {
    boxShadow:
      styleId === "minimal"
        ? "0 12px 32px rgba(31, 24, 20, 0.05)"
        : "0 18px 48px rgba(31, 24, 20, 0.08)",
    maxWidth: formatId === "11x8.5-landscape" ? "52rem" : undefined,
  } satisfies CSSProperties;
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
      selected={photo.id === selectedPhotoId}
      treatment={treatment}
      onSelect={() => onSelectPhoto(photo.id)}
    />
  );
  const renderEmptyTile = () => (
    <EmptyPhotoSlot className="min-h-[16rem]">
      Move a photo onto this spread to keep building the draft.
    </EmptyPhotoSlot>
  );
  const renderCompactEmptyTile = () => (
    <EmptyPhotoSlot className="min-h-[10rem]">
      Extra photos will stack here.
    </EmptyPhotoSlot>
  );

  const primaryPhoto = pagePhotos[0];
  const supportPhotos = pagePhotos.slice(1);
  const tertiaryPhotos = pagePhotos.slice(2);

  const denseGrid = (
    photos: PhotoAsset[],
    {
      columns = 2,
      minHeight = "min-h-[10rem]",
      treatment = "compact" as const,
    } = {},
    ) => {
      if (!photos.length) {
        return renderCompactEmptyTile();
      }

    const columnClass =
      columns === 1
        ? "grid-cols-1"
        : columns === 2
          ? "sm:grid-cols-2"
          : "sm:grid-cols-2 lg:grid-cols-3";

    return (
      <div className={`grid gap-4 ${columnClass}`}>
        {photos.map((photo) => renderPhotoTile(photo, minHeight, treatment))}
      </div>
    );
  };

  const contactSheet = (
    photos: PhotoAsset[],
    pattern: string[] = [
      "min-h-[18rem] md:col-span-2 md:row-span-2",
      "min-h-[10rem]",
      "min-h-[10rem]",
      "min-h-[11rem] md:col-span-2",
      "min-h-[11rem]",
      "min-h-[11rem]",
    ],
  ) => {
    if (!photos.length) {
      return (
          <div className="grid auto-rows-[9rem] gap-4 md:grid-cols-3">
            <EmptyPhotoSlot className="min-h-[18rem] md:col-span-3">
              Add a few detail shots and the collage will rebalance automatically.
          </EmptyPhotoSlot>
        </div>
      );
    }

    return (
      <div className="grid auto-rows-[9rem] gap-4 md:grid-cols-3">
        {photos.map((photo, index) =>
          renderPhotoTile(
            photo,
            pattern[index % pattern.length] ?? "min-h-[11rem]",
            index === 0 ? "hero" : "compact",
          ),
        )}
      </div>
    );
  };

  const preview = (() => {
    switch (page.style) {
      case "hero":
        return (
          <div className="space-y-4">
            {primaryPhoto
              ? renderPhotoTile(primaryPhoto, "min-h-[25rem] md:min-h-[30rem]", "hero")
              : renderEmptyTile()}
            {denseGrid(supportPhotos, {
              columns: supportPhotos.length >= 3 ? 3 : 2,
              minHeight: "min-h-[10rem]",
            })}
            {copyCard}
          </div>
        );
      case "full_bleed":
        return (
          <div className="grid gap-4 lg:grid-cols-[1.18fr_0.82fr]">
            <div>
              {primaryPhoto
                ? renderPhotoTile(primaryPhoto, "min-h-[28rem] md:min-h-[33rem]", "hero")
                : renderEmptyTile()}
            </div>
            <div className="space-y-4">
              {copyCard}
              {denseGrid(supportPhotos, {
                columns: supportPhotos.length >= 3 ? 3 : 2,
                minHeight: "min-h-[9rem]",
              })}
            </div>
          </div>
        );
      case "diptych":
        return (
          <div className="space-y-4">
            <div className={`grid gap-4 ${pagePhotos.length > 1 ? "md:grid-cols-2" : ""}`}>
              {primaryPhoto
                ? renderPhotoTile(primaryPhoto, "min-h-[21rem] md:min-h-[24rem]", "hero")
                : renderEmptyTile()}
              {pagePhotos[1]
                ? renderPhotoTile(pagePhotos[1], "min-h-[21rem] md:min-h-[24rem]", "hero")
                : pagePhotos.length > 1
                  ? renderCompactEmptyTile()
                  : null}
            </div>
            {denseGrid(tertiaryPhotos, {
              columns: tertiaryPhotos.length >= 3 ? 3 : 2,
              minHeight: "min-h-[9.5rem]",
            })}
            {copyCard}
          </div>
        );
      case "chapter":
        return (
          <div className="grid gap-4 lg:grid-cols-[0.86fr_1.14fr]">
            <div className="space-y-4">
              {copyCard}
              {denseGrid(tertiaryPhotos, {
                columns: tertiaryPhotos.length >= 3 ? 3 : 2,
                minHeight: "min-h-[9rem]",
              })}
            </div>
            <div className="space-y-4">
              {primaryPhoto
                ? renderPhotoTile(primaryPhoto, "min-h-[23rem] md:min-h-[27rem]", "hero")
                : renderEmptyTile()}
              {pagePhotos[1]
                ? renderPhotoTile(pagePhotos[1], "min-h-[11rem]", "default")
                : renderCompactEmptyTile()}
            </div>
          </div>
        );
      case "mosaic":
        return (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.16fr_0.84fr]">
              <div>
                {primaryPhoto
                  ? renderPhotoTile(primaryPhoto, "min-h-[24rem] md:min-h-[30rem]", "hero")
                  : renderEmptyTile()}
              </div>
              <div className="space-y-4">
                {pagePhotos[1]
                  ? renderPhotoTile(pagePhotos[1], "min-h-[13rem]", "default")
                  : renderCompactEmptyTile()}
                {denseGrid(pagePhotos.slice(2), {
                  columns: 2,
                  minHeight: "min-h-[9rem]",
                })}
              </div>
            </div>
            {copyCard}
          </div>
        );
      case "collage":
        return (
          <div className="space-y-4">
            {copyCard}
            {contactSheet(pagePhotos)}
          </div>
        );
      case "recap":
        return (
          <div className="space-y-4">
            {copyCard}
            {denseGrid(pagePhotos, {
              columns: pagePhotos.length >= 5 ? 3 : 2,
              minHeight: pagePhotos.length >= 5 ? "min-h-[8.5rem]" : "min-h-[11rem]",
            })}
          </div>
        );
      case "closing":
        return (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.02fr_0.98fr]">
              <div className="space-y-4">
                {primaryPhoto
                  ? renderPhotoTile(primaryPhoto, "min-h-[22rem] md:min-h-[26rem]", "hero")
                  : renderEmptyTile()}
                {supportPhotos.length
                  ? denseGrid(supportPhotos, { columns: 2 })
                  : renderCompactEmptyTile()}
              </div>
              <div className="flex flex-col justify-end">{copyCard}</div>
            </div>
          </div>
        );
      case "balanced":
      default:
        return (
          <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              {primaryPhoto
                ? renderPhotoTile(primaryPhoto, "min-h-[23rem] md:min-h-[28rem]", "hero")
                : renderEmptyTile()}
            </div>
            <div className="space-y-4">
              {copyCard}
              {denseGrid(supportPhotos, {
                columns: supportPhotos.length >= 3 ? 3 : 2,
                minHeight: supportPhotos.length >= 3 ? "min-h-[8.5rem]" : "min-h-[10rem]",
              })}
            </div>
          </div>
        );
    }
  })();

  return (
    <div className="mx-auto w-full space-y-4" style={canvasStyle}>
      {preview}
    </div>
  );
}

function EditorPhotoTile({
  accent,
  caption,
  className = "min-h-[16rem]",
  fontPreset,
  photo,
  selected,
  treatment = "default",
  onSelect,
}: {
  accent: string;
  caption?: string;
  className?: string;
  fontPreset: { body: string; headline: string };
  photo: PhotoAsset;
  selected: boolean;
  treatment?: "default" | "hero" | "compact";
  onSelect: () => void;
}) {
  const cardPadding =
    treatment === "compact" ? "p-3" : treatment === "hero" ? "p-5" : "p-4";
  const titleClass =
    treatment === "compact" ? "text-sm" : treatment === "hero" ? "text-lg" : "text-base";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex w-full overflow-hidden rounded-[1.8rem] border text-left transition-transform hover:-translate-y-0.5 ${className} ${selected ? "border-[#8f4f2e66] shadow-[0_0_0_3px_rgba(143,79,46,0.16)]" : "border-white/45"}`}
      style={{
        boxShadow: `inset 0 0 0 1px ${accent}22`,
      }}
    >
      {photo.imageUri ? (
        <>
          <img
            src={photo.imageUri}
            alt={photo.title}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,13,10,0.1),rgba(20,13,10,0.38))]" />
        </>
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.9),rgba(234,225,216,0.96))]" />
      )}

      <div className={`relative flex w-full flex-col justify-between ${cardPadding}`}>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#f6eee8] drop-shadow-sm">
          {photo.orientation}
        </div>
        <div className="rounded-[1.2rem] border border-white/45 bg-white/78 px-4 py-3 backdrop-blur-sm">
          <div
            className={`${titleClass} font-semibold text-[#1f1814]`}
            style={{ fontFamily: fontPreset.headline }}
          >
            {photo.title}
          </div>
          <div
            className="mt-1 text-xs uppercase tracking-[0.16em] text-[#7a6d64]"
            style={{ fontFamily: fontPreset.body }}
          >
            {caption || photo.locationLabel || "Add a photo caption"}
          </div>
        </div>
      </div>
    </button>
  );
}

function EmptyPhotoSlot({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <div
      className={`flex items-center justify-center rounded-[1.8rem] border border-dashed border-[#00000018] bg-white/56 px-6 text-center text-sm leading-7 text-[#6f625b] ${className}`}
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
        <div className="rounded-[1rem] border border-[#0000000d] bg-[#fff9f4] px-4 py-3 text-sm text-[#6a5f58]">
          {selectedOption?.helper}
        </div>
      </div>
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
  return {
    formatId: "12x12-square",
    styleId: "editorial",
    fontPresetId: "gallery",
    project: cloneProject(project),
    photoCaptions: project.photos.reduce<Record<string, string>>((captions, photo) => {
      captions[photo.id] = photo.locationLabel ?? photo.title;
      return captions;
    }, {}),
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

function getWorkingDraftKey(projectId: string) {
  return `photo-book-maker:working-draft:${projectId}`;
}

function getPublishedDraftsKey(projectId: string) {
  return `photo-book-maker:published-drafts:${projectId}`;
}

function readDraftStorage<T>(key: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeDraftStorage(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures in preview mode.
  }
}
