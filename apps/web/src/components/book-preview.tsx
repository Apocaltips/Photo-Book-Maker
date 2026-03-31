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
import { getBookThemePresentation } from "@/lib/book-theme-styles";

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
                  <PreviewTag tone="accent">{selectedPage.storyBeat.replaceAll("_", " ")}</PreviewTag>
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
  spreadType: ReturnType<typeof normalizeSpreadType>;
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
  spreadType,
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
  const heroPhoto = photos[0];
  const supportingPhotos = photos.slice(1);
  const tertiaryPhotos = photos.slice(2);
  const metaTags = photos.length ? (
    <div className="mt-4 flex flex-wrap gap-2">
      {photos.slice(0, 3).map((photo) => (
        <PreviewTag key={photo.id}>{photo.locationLabel ?? project.title}</PreviewTag>
      ))}
    </div>
  ) : null;
  const renderNarrativeStrip = (className = "mx-auto max-w-[44rem]") => (
    <PreviewNarrativeStrip
      className={className}
      page={page}
      photos={photos}
      project={project}
      themePresentation={themePresentation}
    />
  );

  const previewBody = (() => {
    switch (spreadType) {
      case "hero_full_bleed":
        return (
          <div className="space-y-4">
            <div className="rounded-[2.3rem] bg-[#16110d] p-2 shadow-[0_24px_54px_rgba(24,16,10,0.18)]">
              <PreviewPhotoTile
                photo={heroPhoto}
                accent={accent}
                className="min-h-[26rem] md:min-h-[33rem]"
                emphasis="large"
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-[0.88fr_1.12fr]">
              <div className="rounded-[1.8rem] border border-black/5 bg-white/82 px-5 py-5">
                <div className="text-[11px] uppercase tracking-[0.22em]" style={{ color: themePresentation.textMuted }}>
                  Opening spread
                </div>
                <h3 className="mt-3 text-3xl font-semibold leading-[0.95]" style={{ color: themePresentation.textColor }}>
                  {page.title}
                </h3>
                <p className="mt-4 text-sm leading-7" style={{ color: themePresentation.textMuted }}>
                  {page.caption}
                </p>
                {metaTags}
              </div>
              {supportingPhotos.length ? (
                <div className="rounded-[1.8rem] border border-black/5 bg-white/68 p-3">
                  <div className="mb-3 text-[11px] uppercase tracking-[0.2em]" style={{ color: themePresentation.textMuted }}>
                    Follow-through
                  </div>
                  <PreviewPhotoGrid
                    accent={accent}
                    photos={supportingPhotos}
                    minHeight="min-h-[8rem]"
                    maxColumns={3}
                  />
                </div>
              ) : null}
            </div>
          </div>
        );
      case "hero_support_strip":
        return (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.12fr_0.88fr]">
              <div className="rounded-[2rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(245,237,231,0.92))] p-3">
                <PreviewPhotoTile
                  photo={heroPhoto}
                  accent={accent}
                  className="min-h-[25rem] md:min-h-[31rem]"
                  emphasis="large"
                />
              </div>
              <div className="rounded-[2rem] border border-black/5 bg-[#fbf5ef] p-4">
                <div className="relative min-h-[27rem]">
                  {supportingPhotos[0] ? (
                    <div className="max-w-[13.5rem]">
                      <PreviewPhotoTile photo={supportingPhotos[0]} accent={accent} className="min-h-[11rem]" />
                    </div>
                  ) : (
                    <div className="rounded-[1.6rem] border border-dashed border-black/10 bg-white/60 px-5 py-5 text-sm leading-7" style={{ color: themePresentation.textMuted }}>
                      Add a smaller supporting photo.
                    </div>
                  )}
                  {supportingPhotos[1] ? (
                    <div className="ml-auto mt-[-1.25rem] max-w-[15rem]">
                      <PreviewPhotoTile photo={supportingPhotos[1]} accent={accent} className="min-h-[13rem]" />
                    </div>
                  ) : null}
                  {supportingPhotos.slice(2).length ? (
                    <div className="mt-4 rounded-[1.5rem] border border-black/5 bg-white/78 p-2.5">
                      <PreviewPhotoGrid accent={accent} photos={supportingPhotos.slice(2)} minHeight="min-h-[6.5rem]" maxColumns={3} />
                    </div>
                  ) : null}
                  <div className="absolute bottom-0 right-0">
                    {renderNarrativeStrip("max-w-[14rem] bg-white/90")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case "balanced_two_up":
        return (
          <div className="space-y-4">
            <div className="rounded-[2rem] border border-black/5 bg-[linear-gradient(180deg,rgba(248,241,233,0.98),rgba(241,233,224,0.96))] p-5">
              <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
                {photos.slice(0, 2).map((photo) => (
                  <div key={photo.id} className="rounded-[1.7rem] border border-black/5 bg-white/92 p-3">
                    <PreviewPhotoTile
                      photo={photo}
                      accent={accent}
                      className="min-h-[21rem] md:min-h-[25rem]"
                      emphasis="large"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-[1.18fr_0.82fr] lg:items-start">
              {tertiaryPhotos.length ? (
                <div className="rounded-[1.8rem] border border-black/5 bg-[#fffaf4] p-3">
                  <PreviewPhotoGrid
                    accent={accent}
                    photos={tertiaryPhotos}
                    minHeight="min-h-[8rem]"
                    maxColumns={3}
                  />
                </div>
              ) : (
                <div className="rounded-[1.8rem] border border-dashed border-black/10 bg-white/58 px-5 py-4 text-sm leading-7" style={{ color: themePresentation.textMuted }}>
                  Let the pair breathe when the two main frames already carry the spread.
                </div>
              )}
              <div className="flex justify-end">{renderNarrativeStrip("max-w-[14rem] bg-white/88")}</div>
            </div>
          </div>
        );
      case "four_up_grid":
        return (
          <div className="space-y-4">
            <div className="rounded-[2rem] border border-black/5 bg-white/78 p-4">
              <div className="grid gap-4 md:grid-cols-3">
                {photos.map((photo) => (
                  <PreviewPhotoTile
                    key={photo.id}
                    photo={photo}
                    accent={accent}
                    className={editorState.density >= 55 ? "min-h-[12rem]" : "min-h-[14rem]"}
                  />
                ))}
                <div className="md:col-span-3 flex justify-center pt-1">
                  {renderNarrativeStrip("max-w-[17rem] bg-white/88")}
                </div>
              </div>
            </div>
          </div>
        );
      case "dense_candid_grid":
        return (
          <div className="space-y-4">
            <div className="rounded-[2rem] border border-black/5 bg-[linear-gradient(180deg,rgba(255,249,243,0.98),rgba(247,238,229,0.96))] p-4">
              <div className="mb-4 text-[11px] uppercase tracking-[0.22em]" style={{ color: themePresentation.textMuted }}>
                Collected candids
              </div>
              <div className="grid gap-3 md:grid-cols-6">
                {photos.map((photo, index) => (
                  <div
                    key={photo.id}
                    className={[
                      index % 5 === 0 ? "md:col-span-3" : "md:col-span-2",
                      index % 4 === 1 ? "md:-rotate-[1.4deg]" : "",
                      index % 4 === 2 ? "md:rotate-[1.2deg]" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <PreviewPhotoTile
                      photo={photo}
                      accent={accent}
                      className={index % 5 === 0 ? "min-h-[11rem] md:min-h-[14rem]" : "min-h-[8rem] md:min-h-[9rem]"}
                    />
                  </div>
                ))}
                <div className="md:col-span-2 md:self-end">
                  {renderNarrativeStrip("max-w-none bg-white/88")}
                </div>
              </div>
            </div>
          </div>
        );
      case "panorama_spread":
        return (
          <div className="space-y-4">
            <div className="rounded-[2.15rem] border border-black/5 bg-white/88 px-4 py-6">
              <div className="mb-4 text-center text-[2rem] uppercase tracking-[0.16em]" style={{ color: themePresentation.textMuted }}>
                {buildPreviewMastheadLabel(page, photos, project)}
              </div>
              <PreviewPhotoTile
                photo={heroPhoto}
                accent={accent}
                className="min-h-[22rem] md:min-h-[28rem]"
                emphasis="large"
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-[1.28fr_0.72fr] lg:items-end">
              {supportingPhotos.length ? (
                <div className="rounded-[1.8rem] border border-black/5 bg-white/68 p-3">
                  <PreviewPhotoGrid accent={accent} photos={supportingPhotos} minHeight="min-h-[7.5rem]" maxColumns={4} />
                </div>
              ) : null}
              <div className="flex justify-end">{renderNarrativeStrip("max-w-[14rem] bg-white/88")}</div>
            </div>
          </div>
        );
      case "text_divider":
        return (
          <div className="grid gap-4 lg:grid-cols-[0.86fr_1.14fr]">
            <div className="rounded-[2rem] border border-black/5 px-6 py-8" style={themePresentation.mutedPanelStyle}>
              <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: themePresentation.textMuted }}>
                Divider spread
              </div>
              <h2 className="display mt-4 text-5xl leading-[0.88]" style={{ color: themePresentation.textColor }}>
                {page.title}
              </h2>
              <p className="mt-5 max-w-sm text-sm leading-7" style={{ color: themePresentation.textMuted }}>
                {page.caption}
              </p>
            </div>
            <div className="space-y-4 rounded-[2rem] border border-dashed border-black/10 bg-white/58 p-4">
              <div className="text-[11px] uppercase tracking-[0.22em]" style={{ color: themePresentation.textMuted }}>
                Optional anchor image
              </div>
              <PreviewPhotoTile
                photo={heroPhoto}
                accent={accent}
                className="min-h-[24rem] md:min-h-[30rem]"
                emphasis="large"
              />
            </div>
          </div>
        );
      case "photo_journal":
        return (
          <div className="grid gap-4 lg:grid-cols-[1.22fr_0.78fr]">
            <div className="space-y-4">
              <div className="rounded-[2rem] bg-[linear-gradient(180deg,rgba(244,237,229,0.98),rgba(237,229,219,0.96))] p-6">
                <div className="mx-auto max-w-[20rem] rounded-[1.7rem] border border-black/5 bg-white/95 p-4 shadow-[0_14px_34px_rgba(45,32,22,0.08)]">
                  <PreviewPhotoTile
                    photo={heroPhoto}
                    accent={accent}
                    className="min-h-[20rem] md:min-h-[24rem]"
                    emphasis="large"
                  />
                </div>
              </div>
              {supportingPhotos.length ? (
                <div className="rounded-[1.7rem] border border-black/5 bg-white/72 p-3">
                  <PreviewPhotoGrid accent={accent} photos={supportingPhotos} minHeight="min-h-[9rem]" maxColumns={2} />
                </div>
              ) : null}
            </div>
            <div className="space-y-3 rounded-[2rem] border border-black/5 bg-[linear-gradient(180deg,rgba(255,251,246,0.98),rgba(246,236,226,0.96))] p-4">
              {renderNarrativeStrip("max-w-none bg-[#fffdf8] shadow-none")}
              {editorState.showHandwrittenNotes ? (
                <div className="rounded-[1.4rem] border border-dashed border-[#dccfc4] bg-white/75 px-4 py-4 text-[12px] leading-6" style={{ color: themePresentation.textMuted }}>
                  Handwritten note block: keep this to one small personal line.
                </div>
              ) : null}
            </div>
          </div>
        );
      case "memorabilia_spread":
        return (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.18fr_0.82fr]">
              <PreviewPhotoTile
                photo={heroPhoto}
                accent={accent}
                className="min-h-[24rem] md:min-h-[28rem]"
                emphasis="large"
              />
              <div className="space-y-3 rounded-[2rem] border border-black/5 bg-[linear-gradient(180deg,rgba(252,246,239,0.98),rgba(246,237,228,0.96))] p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {supportingPhotos.slice(0, 4).map((photo, index) => (
                    <div
                      key={photo.id}
                      className={`rounded-[1.3rem] border border-black/10 bg-white/86 p-2 ${index % 2 === 0 ? "rotate-[-1deg]" : "rotate-[1deg]"}`}
                    >
                      <PreviewPhotoTile photo={photo} accent={accent} className="min-h-[8rem]" />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">{renderNarrativeStrip("max-w-[14rem] bg-white/82")}</div>
              </div>
            </div>
          </div>
        );
      case "pattern_repetition":
        return (
          <div className="space-y-4">
            <div className="rounded-[2rem] border border-black/5 bg-[#f8f4ee] p-4">
              <div className="grid gap-3 md:grid-cols-4">
                {photos.map((photo) => (
                  <div key={photo.id} className="rounded-[1.5rem] border border-black/5 bg-white/88 p-2">
                    <PreviewPhotoTile photo={photo} accent={accent} className="min-h-[11rem] md:min-h-[13rem]" />
                  </div>
                ))}
                <div className="md:col-span-1 md:self-end">
                  {renderNarrativeStrip("max-w-none bg-white/88")}
                </div>
              </div>
            </div>
          </div>
        );
      case "burst_sequence":
        return (
          <div className="space-y-4">
            <div className="rounded-[2rem] border border-black/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(240,234,228,0.94))] p-4">
              <div className="grid gap-3 md:grid-cols-12">
                {photos.map((photo, index) => {
                  const spanClass =
                    index === 0 ? "md:col-span-12" : index % 4 === 0 ? "md:col-span-4" : "md:col-span-2";

                  return (
                    <div key={photo.id} className={spanClass}>
                      <PreviewPhotoTile
                        photo={photo}
                        accent={accent}
                        className={index === 0 ? "min-h-[15rem] md:min-h-[17rem]" : "min-h-[8rem] md:min-h-[9rem]"}
                        emphasis={index === 0 ? "large" : undefined}
                      />
                    </div>
                  );
                })}
                <div className="md:col-span-2 md:self-end">
                  {renderNarrativeStrip("max-w-none bg-white/88")}
                </div>
              </div>
            </div>
          </div>
        );
      case "map_timeline":
        return (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
              <div className="space-y-3 rounded-[2rem] border border-black/5 bg-[linear-gradient(180deg,rgba(250,246,240,0.98),rgba(245,236,227,0.96))] p-4">
                <div className="rounded-[1.6rem] border border-dashed border-black/10 px-4 py-4">
                  <div className="text-xl font-semibold" style={{ color: themePresentation.textColor }}>
                    {photos.find((photo) => photo.locationLabel)?.locationLabel ?? project.title}
                  </div>
                  <div className="mt-2 text-sm leading-7" style={{ color: themePresentation.textMuted }}>
                    {photos[0]?.capturedAt
                      ? new Date(photos[0].capturedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          timeZone: project.timezone,
                        })
                      : project.startDate}
                  </div>
                  <div className="mt-4 h-24 rounded-[1.2rem] border border-dashed border-black/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.65),rgba(247,236,225,0.78))]" />
                </div>
                {renderNarrativeStrip("max-w-none bg-white/82")}
              </div>
              <div className="space-y-4">
                <PreviewPhotoTile
                  photo={heroPhoto}
                  accent={accent}
                  className="min-h-[24rem] md:min-h-[30rem]"
                  emphasis="large"
                />
                {supportingPhotos.length ? (
                  <div className="rounded-[1.8rem] border border-black/5 bg-white/72 p-3">
                    <PreviewPhotoGrid accent={accent} photos={supportingPhotos} minHeight="min-h-[8.5rem]" maxColumns={2} />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      default:
        return (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.24fr_0.76fr]">
              <PreviewPhotoTile photo={heroPhoto} accent={accent} className="min-h-[24rem] md:min-h-[30rem]" emphasis="large" />
              <div className="space-y-4">
                <PreviewPhotoGrid accent={accent} photos={supportingPhotos} minHeight="min-h-[10rem]" maxColumns={1} />
                {renderNarrativeStrip("max-w-none")}
              </div>
            </div>
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
    <div className={`rounded-[1.35rem] border border-black/5 bg-white/88 px-3.5 py-3 ${className ?? ""}`}>
      <div className="space-y-2.5">
        <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: themePresentation.textMuted }}>
          {page.storyBeat.replaceAll("_", " ")}
        </div>
        <div className="space-y-1.5">
          <h3 className="max-w-[18ch] text-[0.98rem] font-semibold leading-tight" style={{ color: themePresentation.textColor }}>
            {truncateWords(page.title, 6)}
          </h3>
          {copy ? (
            <p className="max-w-[24ch] text-[11px] leading-[1.45]" style={{ color: themePresentation.textMuted }}>
              {copy}
            </p>
          ) : null}
        </div>
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
  const showFooter = emphasis !== "large";

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
        <div className="absolute inset-0 flex flex-col justify-between p-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#786b62]">
          {photo?.orientation ?? "layout"}
        </div>
        {!showFooter ? (
          <div className="rounded-[1.2rem] bg-[linear-gradient(180deg,rgba(17,12,9,0),rgba(17,12,9,0.72))] px-4 pb-1 pt-8 text-white">
            <div className="text-lg font-semibold">
              {photo?.title ?? "Reserved image field"}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[#eee0d4]">
              {photo?.locationLabel ?? "Editorial crop zone"}
            </div>
          </div>
        ) : null}
      </div>
      </div>
      {showFooter ? (
        <div className="border-t border-white/25 bg-[linear-gradient(180deg,rgba(255,250,246,0.94),rgba(243,233,224,0.96))] px-4 py-3">
          <div className="text-sm font-semibold text-[#211a16]">
            {photo?.title ?? "Reserved image field"}
          </div>
        </div>
      ) : null}
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

function buildPreviewMastheadLabel(page: BookPage, photos: PhotoAsset[], project: Project) {
  const source = photos.find((photo) => photo.locationLabel)?.locationLabel ?? page.title ?? project.title;
  const words = source
    .replace(/[^\w\s-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return words.join(" ").toUpperCase() || project.title.toUpperCase();
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
