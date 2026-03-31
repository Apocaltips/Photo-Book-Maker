"use client";

import type {
  BookDraft,
  BookDraftEditorState,
  BookPage,
  PhotoAsset,
  Project,
} from "@photo-book-maker/core";
import type { ReactNode } from "react";
import { APPROVED_SPREAD_LIBRARY, normalizeSpreadType } from "@/lib/book-editor";

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
  const projectTitle = title ?? project.title;
  const projectSubtitle = subtitle ?? project.subtitle;
  const activeThemeId = selectedThemeId ?? project.selectedThemeId;
  const selectedTheme =
    project.bookThemes.find((theme) => theme.id === activeThemeId) ?? project.bookThemes[0];
  const coverPhoto =
    project.photos.find((photo) => draft.pages[0]?.photoIds.includes(photo.id) && photo.imageUri) ??
    project.photos.find((photo) => photo.mustInclude && photo.imageUri) ??
    project.photos.find((photo) => photo.imageUri) ??
    project.photos[0];
  const confirmedCopy = draft.pages.filter((page) => page.copyStatus === "confirmed").length;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2.8rem] border border-[#00000012] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,238,232,0.95))] lg:grid lg:grid-cols-[1.02fr_0.98fr]">
        <div className="relative min-h-[28rem] overflow-hidden border-b border-[#00000010] bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.94),rgba(228,216,205,0.94))] lg:border-b-0 lg:border-r">
          {coverPhoto?.imageUri ? (
            <>
              <img
                src={coverPhoto.imageUri}
                alt={coverPhoto.title}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,14,10,0.08),rgba(20,14,10,0.36))]" />
            </>
          ) : null}
          <div className="absolute inset-x-6 bottom-6 rounded-[1.8rem] border border-white/45 bg-white/76 px-5 py-5 backdrop-blur-sm">
            <div className="text-xs uppercase tracking-[0.22em] text-[#8a5b42]">
              {draft.format} / {draftName}
            </div>
            <div className="mt-3 text-sm leading-7 text-[#5f544d]">{draft.summary}</div>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-8 px-6 py-8 md:px-8 md:py-10">
          <div className="space-y-5">
            <div className="eyebrow">Printable preview</div>
            <div className="space-y-4">
              <h1 className="display text-5xl leading-none text-[#1f1814] sm:text-6xl">
                {projectTitle}
              </h1>
              <p className="max-w-2xl text-base leading-8 text-[#5c5048]">
                {projectSubtitle}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <PreviewStat label="Theme" value={selectedTheme.name} accent={selectedTheme.accent} />
            <PreviewStat
              label="Copy confirmed"
              value={`${confirmedCopy}/${draft.pages.length}`}
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

      <div className="space-y-8">
        {draft.pages.map((page, index) => (
          <PreviewSpread
            key={page.id}
            accent={selectedTheme.accent}
            editorState={editorState}
            page={page}
            pageNumber={index + 1}
            photos={getPagePhotos(project, page)}
          />
        ))}
      </div>
    </div>
  );
}

function PreviewSpread({
  accent,
  editorState,
  page,
  pageNumber,
  photos,
}: {
  accent: string;
  editorState: BookDraftEditorState;
  page: BookPage;
  pageNumber: number;
  photos: PhotoAsset[];
}) {
  const spreadType = normalizeSpreadType(page.style);

  return (
    <article className="overflow-hidden rounded-[2.4rem] border border-[#00000012] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,240,233,0.95))] shadow-[0_28px_80px_rgba(46,32,20,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#00000010] px-5 py-4 md:px-6">
        <div className="text-xs uppercase tracking-[0.22em] text-[#7d7067]">
          Spread {pageNumber}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PreviewTag>{getSpreadLabel(page.style)}</PreviewTag>
          <PreviewTag tone="accent">{page.storyBeat.replaceAll("_", " ")}</PreviewTag>
          <PreviewTag tone={page.copyStatus === "confirmed" ? "success" : "neutral"}>
            {page.copyStatus === "confirmed" ? "Copy confirmed" : "Prefilled copy"}
          </PreviewTag>
          <PreviewTag tone="neutral">{editorState.captionTone}</PreviewTag>
        </div>
      </div>

      <div className="p-5 md:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.08fr)_22rem]">
          <div>
            <PreviewCanvas
              accent={accent}
              editorState={editorState}
              page={page}
              photos={photos}
              spreadType={spreadType}
            />
          </div>
          <PreviewCopyPanel page={page} />
        </div>
      </div>
    </article>
  );
}

function PreviewCanvas({
  accent,
  editorState,
  page,
  photos,
  spreadType,
}: {
  accent: string;
  editorState: BookDraftEditorState;
  page: BookPage;
  photos: PhotoAsset[];
  spreadType: ReturnType<typeof normalizeSpreadType>;
}) {
  const heroPhoto = photos[0];
  const supportingPhotos = photos.slice(1);
  const densityClass =
    editorState.density >= 70
      ? "min-h-[9rem]"
      : editorState.density >= 50
        ? "min-h-[11rem]"
        : "min-h-[13rem]";

  const previewBody = (() => {
    switch (spreadType) {
      case "hero_full_bleed":
      case "panorama_spread":
        return (
          <div className="space-y-4">
            <PreviewPhotoTile photo={heroPhoto} accent={accent} className="min-h-[30rem]" emphasis="large" />
            {supportingPhotos.length ? (
              <PreviewPhotoGrid accent={accent} photos={supportingPhotos} minHeight="min-h-[9rem]" />
            ) : null}
          </div>
        );
      case "hero_support_strip":
        return (
          <div className="grid gap-4 lg:grid-cols-[1.18fr_0.82fr]">
            <PreviewPhotoTile photo={heroPhoto} accent={accent} className="min-h-[28rem]" emphasis="large" />
            <PreviewPhotoGrid accent={accent} photos={supportingPhotos} minHeight="min-h-[9rem]" maxColumns={1} />
          </div>
        );
      case "balanced_two_up":
        return (
          <div className="grid gap-4 md:grid-cols-2">
            {photos.slice(0, 2).map((photo) => (
              <PreviewPhotoTile
                key={photo.id}
                photo={photo}
                accent={accent}
                className="min-h-[24rem]"
                emphasis="large"
              />
            ))}
          </div>
        );
      case "four_up_grid":
      case "dense_candid_grid":
      case "pattern_repetition":
      case "burst_sequence":
        return (
          <PreviewPhotoGrid
            accent={accent}
            maxColumns={spreadType === "dense_candid_grid" ? 3 : 2}
            minHeight={densityClass}
            photos={photos}
          />
        );
      case "text_divider":
        return (
          <div className="flex min-h-[24rem] items-center justify-center rounded-[2rem] border border-[#00000010] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(244,236,229,0.96))] px-10 text-center">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-[#8a5b42]">
                Chapter divider
              </div>
              <h2 className="display mt-4 text-4xl text-[#1f1814]">{page.title}</h2>
              <p className="mt-4 max-w-xl text-sm leading-8 text-[#5f544d]">{page.caption}</p>
            </div>
          </div>
        );
      case "photo_journal":
        return (
          <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
            <PreviewPhotoGrid accent={accent} photos={photos} minHeight="min-h-[12rem]" maxColumns={1} />
            <div className="rounded-[2rem] border border-[#00000010] bg-white/82 p-6">
              <div className="text-[11px] uppercase tracking-[0.22em] text-[#8a5b42]">
                Journal block
              </div>
              <p className="mt-4 text-sm leading-8 text-[#5f544d]">{page.caption}</p>
            </div>
          </div>
        );
      case "memorabilia_spread":
      case "map_timeline":
        return (
          <div className="grid gap-4 lg:grid-cols-[1fr_0.95fr]">
            <div className="rounded-[2rem] border border-[#00000010] bg-[#f8f1ea] p-5">
              <div className="text-[11px] uppercase tracking-[0.22em] text-[#8a5b42]">
                {spreadType === "map_timeline" ? "Route context" : "Memorabilia notes"}
              </div>
              <h3 className="mt-4 text-2xl font-semibold text-[#1f1814]">{page.title}</h3>
              <p className="mt-3 text-sm leading-8 text-[#5f544d]">{page.caption}</p>
            </div>
            <PreviewPhotoGrid accent={accent} photos={photos} minHeight="min-h-[12rem]" />
          </div>
        );
      default:
        return (
          <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
            <PreviewPhotoTile photo={heroPhoto} accent={accent} className="min-h-[28rem]" emphasis="large" />
            <PreviewPhotoGrid accent={accent} photos={supportingPhotos} minHeight="min-h-[10rem]" maxColumns={1} />
          </div>
        );
    }
  })();

  return (
    <div className="overflow-hidden rounded-[2rem] border border-[#00000010] bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(242,235,228,0.96))] p-4 shadow-[0_18px_44px_rgba(42,29,19,0.08)]">
      {previewBody}
      {editorState.printPreviewMode !== "clean" ? (
        <div className="mt-4 rounded-[1.2rem] border border-[#ead5c4] bg-[#fff8f2] px-4 py-3 text-xs uppercase tracking-[0.18em] text-[#8f4f2e]">
          {editorState.printPreviewMode === "bleed" ? "Bleed + gutter preview" : "Print-safe preview"}
        </div>
      ) : null}
    </div>
  );
}

function PreviewCopyPanel({ page }: { page: BookPage }) {
  return (
    <div className="rounded-[2rem] border border-[#00000010] bg-white/84 p-5">
      <div className="text-xs uppercase tracking-[0.2em] text-[#8b5a40]">
        Editorial copy
      </div>
      <h2 className="display mt-3 text-3xl leading-none text-[#211a16] sm:text-4xl">
        {page.title}
      </h2>
      <p className="mt-4 text-sm leading-8 text-[#5d524b]">{page.caption}</p>
      <div className="mt-5 rounded-[1.3rem] bg-[#f7f0ea] px-4 py-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#7d7067]">
          Editorial intent
        </div>
        <p className="mt-2 text-sm leading-7 text-[#5f544d]">
          {page.curationNote ?? page.layoutNote}
        </p>
      </div>
      <div className="mt-4 rounded-[1.3rem] border border-[#00000010] bg-[#fffaf5] px-4 py-4 text-sm leading-7 text-[#5d524b]">
        {page.layoutNote}
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
  photo,
}: {
  accent: string;
  className: string;
  emphasis?: "large";
  photo?: PhotoAsset;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[1.8rem] border border-[#00000010] bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(234,225,216,0.96))] ${className}`}
      style={{
        boxShadow: emphasis === "large" ? `inset 0 0 0 1px ${accent}22` : undefined,
      }}
    >
      {photo?.imageUri ? (
        <>
          <img src={photo.imageUri} alt={photo.title} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(16,11,8,0.05),rgba(16,11,8,0.28))]" />
        </>
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.92),rgba(232,221,212,0.98))]" />
      )}
      <div className="absolute inset-0 flex flex-col justify-between p-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#786b62]">
          {photo?.orientation ?? "layout"}
        </div>
        <div className="rounded-[1.2rem] border border-white/40 bg-white/74 px-4 py-3 backdrop-blur-sm">
          <div className="text-sm font-semibold text-[#211a16]">
            {photo?.title ?? "Reserved image field"}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[#7a6e65]">
            {photo?.locationLabel ?? "Editorial crop zone"}
          </div>
        </div>
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
