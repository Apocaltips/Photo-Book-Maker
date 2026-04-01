"use client";

import type {
  BookDraft,
  BookDraftEditorState,
  BookPage,
  PhotoAsset,
  Project,
} from "@photo-book-maker/core";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import { APPROVED_SPREAD_LIBRARY, normalizeSpreadType } from "@/lib/book-editor";
import { StorybookPageCanvas } from "@/components/storybook-page-canvas";
import { getBookThemePresentation } from "@/lib/book-theme-styles";

function formatStoryBeat(value?: string | null) {
  return (value ?? "details").replaceAll("_", " ");
}

export function BookPreview({
  draft,
  draftName = "Working draft",
  draftSavedAt,
  editorState,
  project,
  selectedThemeId,
  subtitle,
  title,
}: {
  draft: BookDraft;
  draftName?: string;
  draftSavedAt?: string;
  editorState: BookDraftEditorState;
  project: Project;
  selectedThemeId?: string;
  subtitle?: string;
  title?: string;
}) {
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);

  useEffect(() => {
    setSelectedPageIndex(0);
  }, [draft.id, draft.pages.length, draftSavedAt]);

  const pages = draft.pages;
  const pageCount = pages.length;
  const safePageIndex =
    selectedPageIndex >= 0 && selectedPageIndex < pageCount ? selectedPageIndex : 0;
  const selectedPage = pages[safePageIndex];

  const projectTitle = title ?? project.title;
  const projectSubtitle = subtitle ?? project.subtitle;
  const activeThemeId = selectedThemeId ?? project.selectedThemeId;
  const selectedTheme =
    project.bookThemes.find((theme) => theme.id === activeThemeId) ?? project.bookThemes[0];
  const themePresentation = getBookThemePresentation(
    selectedTheme,
    editorState.styleMode,
  );
  const coverPhoto =
    project.photos.find((photo) => pages[0]?.photoIds.includes(photo.id) && photo.imageUri) ??
    project.photos.find((photo) => photo.mustInclude && photo.imageUri) ??
    project.photos.find((photo) => photo.imageUri) ??
    project.photos[0];
  const confirmedCopy = pages.filter((page) => page.copyStatus === "confirmed").length;
  const selectedPhotos = selectedPage ? getPagePhotos(project, selectedPage) : [];

  const selectedSpreadLabel = selectedPage
    ? getSpreadLabel(selectedPage.style)
    : "No spreads yet";

  return (
    <div className="space-y-6">
      <section
        className="overflow-hidden rounded-[2.8rem] lg:grid lg:grid-cols-[0.92fr_1.08fr]"
        style={themePresentation.appStyle}
      >
        <div className="relative min-h-[22rem] overflow-hidden border-b border-black/5 lg:border-b-0 lg:border-r lg:border-r-black/5">
          {coverPhoto?.imageUri ? (
            <>
              <img
                src={coverPhoto.imageUri}
                alt={coverPhoto.title}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,14,10,0.12),rgba(20,14,10,0.4))]" />
            </>
          ) : null}
          <div className="absolute inset-x-6 bottom-6 rounded-[1.8rem] border border-white/40 bg-white/78 px-5 py-5 backdrop-blur-sm">
            <div className="text-xs uppercase tracking-[0.22em] text-[#8a5b42]">
              {draft.format} / {draftName}
            </div>
            <div className="mt-3 text-sm leading-7" style={{ color: themePresentation.textMuted }}>
              {draft.summary}
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-6 px-6 py-7 md:px-8 md:py-8">
          <div className="space-y-4">
            <div className="eyebrow">Printable preview</div>
            <h1 className="display text-5xl leading-none sm:text-6xl" style={{ color: themePresentation.textColor }}>
              {projectTitle}
            </h1>
            <p className="max-w-2xl text-base leading-8" style={{ color: themePresentation.textMuted }}>
              {projectSubtitle}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <PreviewStat label="Theme" value={selectedTheme.name} accent={selectedTheme.accent} />
            <PreviewStat
              label="Copy confirmed"
              value={`${confirmedCopy}/${pageCount}`}
              accent={selectedTheme.accent}
            />
            <PreviewStat
              label="Style mode"
              value={editorState.styleMode.replaceAll("_", " ")}
              accent={selectedTheme.accent}
            />
            <PreviewStat
              label="Saved"
              value={
                draftSavedAt
                  ? new Date(draftSavedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Live"
              }
              accent={selectedTheme.accent}
            />
          </div>
        </div>
      </section>

      {selectedPage ? (
        <section
          className="grid gap-6 overflow-hidden rounded-[2.5rem] p-4 lg:grid-cols-[minmax(0,1.26fr)_19rem] lg:p-5"
          style={themePresentation.chromeStyle}
        >
          <div className="space-y-4">
            <div
              className="overflow-hidden rounded-[2rem] p-4 md:p-5"
              style={themePresentation.canvasFrameStyle}
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-black/5 pb-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em]" style={{ color: themePresentation.textMuted }}>
                    Spread {safePageIndex + 1} of {pageCount}
                  </div>
                  <div className="mt-2 text-lg font-semibold" style={{ color: themePresentation.textColor }}>
                    {selectedSpreadLabel}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <PreviewTag>{selectedSpreadLabel}</PreviewTag>
                  <PreviewTag tone="accent">{formatStoryBeat(selectedPage.storyBeat)}</PreviewTag>
                  <PreviewTag tone={selectedPage.copyStatus === "confirmed" ? "success" : "neutral"}>
                    {selectedPage.copyStatus === "confirmed" ? "Copy confirmed" : "Prefilled copy"}
                  </PreviewTag>
                </div>
              </div>

              <PreviewCanvasV2
                accent={selectedTheme.accent}
                editorState={editorState}
                page={selectedPage}
                photos={selectedPhotos}
                project={project}
                spreadType={normalizeSpreadType(selectedPage.style)}
                themePresentation={themePresentation}
              />

              <PreviewPager
                pageCount={pageCount}
                pages={pages}
                selectedPageIndex={safePageIndex}
                onSelectPage={setSelectedPageIndex}
                activeStyle={themePresentation.pagerActiveStyle}
                idleStyle={themePresentation.secondaryButtonStyle}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[1.8rem] p-5" style={themePresentation.panelStyle}>
              <div className="text-xs uppercase tracking-[0.2em]" style={{ color: themePresentation.textMuted }}>
                Editorial copy
              </div>
              <h2 className="display mt-3 text-2xl leading-none sm:text-3xl" style={{ color: themePresentation.textColor }}>
                {selectedPage.title}
              </h2>
              <p className="mt-3 text-sm leading-7" style={{ color: themePresentation.textMuted }}>
                {selectedPage.caption}
              </p>
            </div>

            <div className="rounded-[1.8rem] p-5" style={themePresentation.mutedPanelStyle}>
              <div className="text-xs uppercase tracking-[0.2em]" style={{ color: themePresentation.textMuted }}>
                Editorial intent
              </div>
              <p className="mt-3 text-sm leading-7" style={{ color: themePresentation.textColor }}>
                {selectedPage.curationNote ?? selectedPage.layoutNote}
              </p>
              <div className="mt-4 rounded-[1.3rem] border border-black/5 bg-white/72 px-4 py-4 text-sm leading-6" style={{ color: themePresentation.textMuted }}>
                {selectedPage.layoutNote}
              </div>
            </div>

            <div className="rounded-[1.8rem] p-5" style={themePresentation.panelStyle}>
              <div className="text-xs uppercase tracking-[0.2em]" style={{ color: themePresentation.textMuted }}>
                Photos on this spread
              </div>
              <div className="mt-4 grid gap-3">
                {selectedPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    className="rounded-[1.2rem] border border-black/5 bg-white/72 px-4 py-3"
                  >
                    <div className="font-medium" style={{ color: themePresentation.textColor }}>
                      {photo.title}
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.16em]" style={{ color: themePresentation.textMuted }}>
                      {photo.locationLabel ?? "Location pending"} / {photo.orientation}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

// Legacy preview renderer kept temporarily while the new spread system settles.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PreviewCanvas({
  accent,
  editorState,
  page,
  photos,
  project,
  spreadType,
  themePresentation,
}: {
  accent: string;
  editorState: BookDraftEditorState;
  page: BookPage;
  photos: PhotoAsset[];
  project: Project;
  spreadType: string;
  themePresentation: ReturnType<typeof getBookThemePresentation>;
}) {
  const heroPhoto = photos[0];
  const supportingPhotos = photos.slice(1);
  const densityClass =
    editorState.density >= 70
      ? "min-h-[8rem]"
      : editorState.density >= 50
        ? "min-h-[10rem]"
        : "min-h-[12rem]";
  const narrativeStrip = (
    <PreviewNarrativeStrip
      page={page}
      photos={photos}
      project={project}
      themePresentation={themePresentation}
    />
  );

  const previewBody = (() => {
    switch (spreadType) {
      case "hero_full_bleed":
      case "panorama_spread":
        return (
          <div className="space-y-4">
            <PreviewPhotoTile photo={heroPhoto} accent={accent} className="min-h-[24rem] md:min-h-[31rem]" emphasis="large" />
            {supportingPhotos.length ? (
              <PreviewPhotoGrid accent={accent} photos={supportingPhotos} minHeight="min-h-[8rem]" />
            ) : null}
            {narrativeStrip}
          </div>
        );
      case "hero_support_strip":
        return (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.24fr_0.76fr]">
              <PreviewPhotoTile photo={heroPhoto} accent={accent} className="min-h-[24rem] md:min-h-[30rem]" emphasis="large" />
              <PreviewPhotoGrid accent={accent} photos={supportingPhotos} minHeight="min-h-[8rem]" maxColumns={1} />
            </div>
            {narrativeStrip}
          </div>
        );
      case "balanced_two_up":
        return (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {photos.slice(0, 2).map((photo) => (
                <PreviewPhotoTile
                  key={photo.id}
                  photo={photo}
                  accent={accent}
                  className="min-h-[21rem] md:min-h-[26rem]"
                  emphasis="large"
                />
              ))}
            </div>
            {supportingPhotos.slice(1).length ? (
              <PreviewPhotoGrid accent={accent} photos={supportingPhotos.slice(1)} minHeight="min-h-[9rem]" maxColumns={3} />
            ) : null}
            {narrativeStrip}
          </div>
        );
      case "four_up_grid":
      case "dense_candid_grid":
      case "pattern_repetition":
      case "burst_sequence":
        return (
          <div className="space-y-4">
            <PreviewPhotoGrid
              accent={accent}
              maxColumns={spreadType === "dense_candid_grid" ? 3 : 2}
              minHeight={densityClass}
              photos={photos}
            />
            {narrativeStrip}
          </div>
        );
      case "text_divider":
        return (
          <div className="grid gap-4 lg:grid-cols-[0.72fr_1.28fr]">
            <div className="flex min-h-[18rem] items-center justify-center rounded-[2rem] border border-black/5 px-8 text-center" style={themePresentation.mutedPanelStyle}>
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em]" style={{ color: themePresentation.textMuted }}>
                  Chapter divider
                </div>
                <h2 className="display mt-4 text-4xl" style={{ color: themePresentation.textColor }}>
                  {page.title}
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-7" style={{ color: themePresentation.textMuted }}>
                  {page.caption}
                </p>
              </div>
            </div>
            <PreviewPhotoTile photo={heroPhoto} accent={accent} className="min-h-[24rem] md:min-h-[30rem]" emphasis="large" />
          </div>
        );
      case "photo_journal":
        return (
          <div className="grid gap-4 lg:grid-cols-[1.18fr_0.82fr]">
            <div className="space-y-4">
              <PreviewPhotoTile photo={heroPhoto} accent={accent} className="min-h-[24rem] md:min-h-[30rem]" emphasis="large" />
              {supportingPhotos.length ? (
                <PreviewPhotoGrid accent={accent} photos={supportingPhotos} minHeight="min-h-[9rem]" maxColumns={2} />
              ) : null}
            </div>
            <div className="space-y-4">
              {narrativeStrip}
              <div className="rounded-[2rem] border border-black/5 bg-white/82 p-6">
                <div className="text-[11px] uppercase tracking-[0.22em]" style={{ color: themePresentation.textMuted }}>
                  Journal block
                </div>
                <p className="mt-4 text-sm leading-7" style={{ color: themePresentation.textColor }}>
                  {page.caption}
                </p>
              </div>
            </div>
          </div>
        );
      case "memorabilia_spread":
      case "map_timeline":
        return (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.18fr_0.82fr]">
              <PreviewPhotoTile photo={heroPhoto} accent={accent} className="min-h-[24rem] md:min-h-[30rem]" emphasis="large" />
              <div className="space-y-4">
                <div className="rounded-[2rem] border border-black/5 p-5" style={themePresentation.mutedPanelStyle}>
                  <div className="text-[11px] uppercase tracking-[0.22em]" style={{ color: themePresentation.textMuted }}>
                    {spreadType === "map_timeline" ? "Route context" : "Memorabilia notes"}
                  </div>
                  <h3 className="mt-4 text-2xl font-semibold" style={{ color: themePresentation.textColor }}>
                    {page.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7" style={{ color: themePresentation.textMuted }}>
                    {page.caption}
                  </p>
                </div>
                {narrativeStrip}
              </div>
            </div>
            {supportingPhotos.length ? (
              <PreviewPhotoGrid accent={accent} photos={supportingPhotos} minHeight="min-h-[9rem]" maxColumns={3} />
            ) : null}
          </div>
        );
      default:
        return (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.24fr_0.76fr]">
              <PreviewPhotoTile photo={heroPhoto} accent={accent} className="min-h-[24rem] md:min-h-[30rem]" emphasis="large" />
              <PreviewPhotoGrid accent={accent} photos={supportingPhotos} minHeight="min-h-[10rem]" maxColumns={1} />
            </div>
            {narrativeStrip}
          </div>
        );
    }
  })();

  return (
    <div className="overflow-hidden rounded-[2rem] p-4 shadow-[0_18px_44px_rgba(42,29,19,0.08)]" style={themePresentation.canvasStyle}>
      {previewBody}
      {editorState.printPreviewMode !== "clean" ? (
        <div className="mt-4 rounded-[1.2rem] px-4 py-3 text-xs uppercase tracking-[0.18em]" style={themePresentation.secondaryButtonStyle}>
          {editorState.printPreviewMode === "bleed" ? "Bleed + gutter preview" : "Print-safe preview"}
        </div>
      ) : null}
    </div>
  );
}

function PreviewCanvasV2({
  accent,
  editorState,
  page,
  photos,
  project,
  spreadType: _spreadType,
  themePresentation,
}: {
  accent: string;
  editorState: BookDraftEditorState;
  page: BookPage;
  photos: PhotoAsset[];
  project: Project;
  spreadType: ReturnType<typeof normalizeSpreadType>;
  themePresentation: ReturnType<typeof getBookThemePresentation>;
}) {
  return (
    <StorybookPageCanvas
      accent={accent}
      editorState={editorState}
      formatId={editorState.formatId}
      mode="preview"
      page={page}
      photos={photos}
      project={project}
      shellStyle={{
        boxShadow: "0 18px 44px rgba(42,29,19,0.08)",
      }}
      themePresentation={themePresentation}
    />
  );
}

function PreviewPager({
  activeStyle,
  idleStyle,
  onSelectPage,
  pageCount,
  pages,
  selectedPageIndex,
}: {
  activeStyle: CSSProperties;
  idleStyle: CSSProperties;
  onSelectPage: (index: number) => void;
  pageCount: number;
  pages: BookPage[];
  selectedPageIndex: number;
}) {
  if (!pageCount) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onSelectPage(Math.max(0, selectedPageIndex - 1))}
          disabled={selectedPageIndex === 0}
          className="rounded-full px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          style={idleStyle}
        >
          Previous page
        </button>
        <div className="text-xs uppercase tracking-[0.18em] text-[#7d7067]">
          Flip through the book one spread at a time
        </div>
        <button
          type="button"
          onClick={() => onSelectPage(Math.min(pageCount - 1, selectedPageIndex + 1))}
          disabled={selectedPageIndex === pageCount - 1}
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
            style={index === selectedPageIndex ? activeStyle : idleStyle}
          >
            {index + 1}. {truncateLabel(page.title)}
          </button>
        ))}
      </div>
    </div>
  );
}

function PreviewNarrativeStrip({
  className,
  page,
  photos: _photos,
  project: _project,
  themePresentation,
}: {
  className?: string;
  page: BookPage;
  photos: PhotoAsset[];
  project: Project;
  themePresentation: ReturnType<typeof getBookThemePresentation>;
}) {
  const copy = buildPreviewOnPageCaption(page);

  return (
    <div className={`rounded-[1.2rem] border border-black/5 bg-white/88 px-3 py-2.5 ${className ?? ""}`}>
      <div className="space-y-1.5">
        <h3 className="max-w-[16ch] text-[0.92rem] font-semibold leading-tight" style={{ color: themePresentation.textColor }}>
          {truncateWords(page.title, 5)}
        </h3>
        {copy ? (
          <p className="max-w-[22ch] text-[10.5px] leading-[1.4]" style={{ color: themePresentation.textMuted }}>
            {copy}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PreviewPhotoGrid({
  accent,
  maxColumns = 2,
  minHeight = "min-h-[10rem]",
  photos,
}: {
  accent: string;
  maxColumns?: number;
  minHeight?: string;
  photos: PhotoAsset[];
}) {
  if (!photos.length) {
    return (
      <div className="rounded-[1.8rem] border border-dashed border-[#00000016] bg-white/65 px-6 py-10 text-sm leading-7 text-[#6f625b]">
        This spread is intentionally light. Add more photos only if they improve the story beat.
      </div>
    );
  }

  const columnClass =
    maxColumns <= 1
      ? "grid-cols-1"
      : maxColumns === 2
        ? "md:grid-cols-2"
        : "md:grid-cols-2 xl:grid-cols-3";

  return (
    <div className={`grid gap-4 ${columnClass}`}>
      {photos.map((photo) => (
        <PreviewPhotoTile
          key={photo.id}
          accent={accent}
          className={minHeight}
          photo={photo}
        />
      ))}
    </div>
  );
}

function PreviewPhotoTile({
  accent,
  className,
  emphasis,
  overlay,
  photo,
}: {
  accent: string;
  className: string;
  emphasis?: "large";
  overlay?: { body?: string; eyebrow?: string; title?: string };
  photo?: PhotoAsset;
}) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-[1.8rem] border border-[#00000010] bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(234,225,216,0.96))] ${className}`}
      style={{
        boxShadow: emphasis === "large" ? `inset 0 0 0 1px ${accent}22` : undefined,
      }}
    >
      <div className="relative min-h-[12rem] flex-1 overflow-hidden">
        {photo?.imageUri ? (
          <>
            <img src={photo.imageUri} alt={photo.title} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(16,11,8,0.03),rgba(16,11,8,0.16))]" />
          </>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.92),rgba(232,221,212,0.98))]" />
        )}
        {overlay ? (
          <div className="absolute inset-x-4 bottom-4 max-w-[18rem] rounded-[1.2rem] border border-white/18 bg-[rgba(20,14,10,0.46)] px-4 py-3 text-[#fff8f2] shadow-[0_10px_24px_rgba(20,14,10,0.14)] backdrop-blur-sm">
            {overlay.eyebrow ? (
              <div className="text-[10px] uppercase tracking-[0.22em] text-[#f4dfcb]">
                {overlay.eyebrow}
              </div>
            ) : null}
            {overlay.title ? (
              <div className="mt-1 text-[1rem] leading-tight font-semibold">
                {overlay.title}
              </div>
            ) : null}
            {overlay.body ? (
              <div className="mt-1.5 text-[11px] leading-[1.45] text-[#f5e7db]">
                {overlay.body}
              </div>
            ) : null}
          </div>
        ) : null}
        {emphasis === "large" ? (
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(16,11,8,0.02),rgba(16,11,8,0.14))]" />
        ) : null}
      </div>
    </div>
  );
}

function PreviewStat({
  accent,
  label,
  value,
}: {
  accent: string;
  label: string;
  value: string;
}) {
  return (
    <div
      className="rounded-[1.4rem] border bg-white/72 px-4 py-4"
      style={{ borderColor: `${accent}22` }}
    >
      <div className="text-xl font-semibold text-[#1f1814]">{value}</div>
      <div className="mt-2 text-xs uppercase tracking-[0.18em] text-[#796d65]">
        {label}
      </div>
    </div>
  );
}

function PreviewTag({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "accent" | "neutral" | "success";
}) {
  const toneClass =
    tone === "accent"
      ? "bg-[#f7dfcf] text-[#98461d]"
      : tone === "success"
        ? "bg-[#dfeee7] text-[#2d624b]"
        : tone === "neutral"
          ? "bg-[#ece4db] text-[#6f625b]"
          : "bg-[#f1ebe4] text-[#6f625b]";

  return (
    <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${toneClass}`}>
      {children}
    </span>
  );
}

function getPagePhotos(project: Project, page: BookPage) {
  return page.photoIds
    .map((photoId) => project.photos.find((photo) => photo.id === photoId))
    .filter((photo): photo is PhotoAsset => Boolean(photo));
}

function getSpreadLabel(style: BookPage["style"]) {
  const normalized =
    APPROVED_SPREAD_LIBRARY.find((entry) => entry.id === style) ??
    APPROVED_SPREAD_LIBRARY.find((entry) => entry.id === normalizeSpreadType(style));

  return normalized?.label ?? style.replaceAll("_", " ");
}

function buildPreviewOnPageCaption(page: BookPage) {
  return truncateSentence(firstSentence(page.caption || page.curationNote), 64);
}

function firstSentence(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "";
  }

  const match = trimmed.match(/^(.+?[.!?])(?:\s|$)/);
  return match?.[1] ?? trimmed;
}

function truncateSentence(value: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const clipped = normalized.slice(0, Math.max(0, maxLength - 1));
  return `${clipped.replace(/[,\s]+$/, "")}...`;
}

function truncateWords(value: string, maxWords: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return value.trim();
  }

  return `${words.slice(0, maxWords).join(" ")}...`;
}

function truncateLabel(value: string) {
  return value.length > 24 ? `${value.slice(0, 24)}...` : value;
}
