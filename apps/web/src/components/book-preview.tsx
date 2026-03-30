import type { BookPage, PhotoAsset, Project } from "@photo-book-maker/core";
import type { ReactNode } from "react";

export function BookPreview({ project }: { project: Project }) {
  const selectedTheme =
    project.bookThemes.find((theme) => theme.id === project.selectedThemeId) ??
    project.bookThemes[0];
  const coverPhoto =
    project.photos.find((photo) => photo.mustInclude && photo.imageUri) ??
    project.photos.find((photo) => photo.imageUri) ??
    project.photos[0];
  const confirmedCopy = project.bookDraft.pages.filter(
    (page) => page.copyStatus === "confirmed",
  ).length;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2.8rem] border border-[#00000012] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,236,229,0.94))] lg:grid lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative min-h-[26rem] overflow-hidden border-b border-[#00000010] bg-[linear-gradient(135deg,rgba(255,255,255,0.5),rgba(234,222,210,0.86))] lg:border-b-0 lg:border-r">
          {coverPhoto?.imageUri ? (
            <img
              src={coverPhoto.imageUri}
              alt={coverPhoto.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.95),rgba(227,214,202,0.92))]">
              <div className="absolute inset-x-8 top-8 rounded-[1.6rem] border border-white/50 bg-white/60 px-5 py-4 backdrop-blur-sm">
                <div className="text-[11px] uppercase tracking-[0.2em] text-[#8a5b42]">
                  Curated first proof
                </div>
                <div className="mt-3 max-w-md text-3xl font-semibold leading-tight text-[#1f1814] sm:text-4xl">
                  {project.title}
                </div>
              </div>
              <div className="absolute inset-x-8 bottom-28 grid gap-3 sm:grid-cols-3">
                {project.bookDraft.pages.slice(0, 3).map((page) => (
                  <div
                    key={page.id}
                    className="rounded-[1.2rem] border border-white/45 bg-white/55 px-4 py-4 backdrop-blur-sm"
                  >
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[#7a6d64]">
                      {getPageStoryBeat(page).replaceAll("_", " ")}
                    </div>
                    <div className="mt-2 text-sm font-medium text-[#221b17]">
                      {page.title}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(25,19,16,0.04),rgba(25,19,16,0.22))]" />
          <div className="absolute inset-x-6 bottom-6 rounded-[1.8rem] border border-white/50 bg-white/72 px-5 py-5 backdrop-blur-sm">
            <div className="text-xs uppercase tracking-[0.22em] text-[#8a5b42]">
              12x12 square preview
            </div>
            <div className="mt-3 text-sm leading-7 text-[#5e534b]">
              {project.bookDraft.summary}
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-8 px-6 py-8 md:px-8 md:py-10">
          <div className="space-y-5">
            <div className="eyebrow">Preview mode</div>
            <div className="space-y-4">
              <h1 className="display text-5xl leading-none text-[#1f1814] sm:text-6xl">
                {project.title}
              </h1>
              <p className="max-w-2xl text-base leading-8 text-[#5c5048]">
                {project.subtitle}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <PreviewStat label="Theme" value={selectedTheme.name} accent={selectedTheme.accent} />
            <PreviewStat
              label="Copy confirmed"
              value={`${confirmedCopy}/${project.bookDraft.pages.length}`}
              accent={selectedTheme.accent}
            />
            <PreviewStat label="Status" value={project.status.replaceAll("_", " ")} accent={selectedTheme.accent} />
            <PreviewStat label="Print format" value={project.bookDraft.format} accent={selectedTheme.accent} />
          </div>
        </div>
      </section>

      <div className="space-y-8">
        {project.bookDraft.pages.map((page, index) => (
          <PreviewSpread
            key={page.id}
            page={page}
            pageNumber={index + 1}
            photos={getPagePhotos(project, page)}
            accent={selectedTheme.accent}
          />
        ))}
      </div>
    </div>
  );
}

function PreviewSpread({
  page,
  pageNumber,
  photos,
  accent,
}: {
  page: BookPage;
  pageNumber: number;
  photos: PhotoAsset[];
  accent: string;
}) {
  const storyBeat = getPageStoryBeat(page);
  const copyStatus = page.copyStatus ?? "prefilled";

  return (
    <article className="overflow-hidden rounded-[2.4rem] border border-[#00000012] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,240,233,0.94))] shadow-[0_28px_80px_rgba(46,32,20,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#00000010] px-5 py-4 md:px-6">
        <div className="text-xs uppercase tracking-[0.22em] text-[#7d7067]">
          Spread {pageNumber}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PreviewTag>{page.style.replaceAll("_", " ")}</PreviewTag>
          <PreviewTag tone="accent">{storyBeat.replaceAll("_", " ")}</PreviewTag>
          <PreviewTag tone={copyStatus === "confirmed" ? "success" : "neutral"}>
            {copyStatus === "confirmed" ? "Copy confirmed" : "Prefilled copy"}
          </PreviewTag>
        </div>
      </div>

      <div className="p-5 md:p-6">{renderSpreadLayout(page, photos, accent)}</div>
    </article>
  );
}

function renderSpreadLayout(page: BookPage, photos: PhotoAsset[], accent: string) {
  switch (page.style) {
    case "hero":
      return (
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <PreviewPhotoTile photo={photos[0]} accent={accent} className="min-h-[30rem]" emphasis="large" />
          <PreviewCopyPanel page={page} />
        </div>
      );
    case "full_bleed":
      return (
        <div className="space-y-5">
          <PreviewPhotoTile
            photo={photos[0]}
            accent={accent}
            className="min-h-[34rem]"
            emphasis="large"
          />
          <PreviewCopyPanel page={page} compact />
        </div>
      );
    case "diptych":
      return (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            {photos.slice(0, 2).map((photo) => (
              <PreviewPhotoTile
                key={photo.id}
                photo={photo}
                accent={accent}
                className="min-h-[22rem]"
              />
            ))}
          </div>
          <PreviewCopyPanel page={page} compact />
        </div>
      );
    case "chapter":
      return (
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <PreviewCopyPanel page={page} emphasis="text-first" />
          <PreviewPhotoTile photo={photos[0]} accent={accent} className="min-h-[24rem]" />
        </div>
      );
    case "mosaic":
    case "collage":
      return (
        <div className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
          <PreviewCopyPanel page={page} />
          <div className="grid gap-4 md:grid-cols-2">
            <PreviewPhotoTile
              photo={photos[0]}
              accent={accent}
              className="min-h-[14rem] md:col-span-2"
              emphasis="large"
            />
            {photos.slice(1).map((photo) => (
              <PreviewPhotoTile
                key={photo.id}
                photo={photo}
                accent={accent}
                className="min-h-[11rem]"
              />
            ))}
          </div>
        </div>
      );
    case "closing":
    case "recap":
      return (
        <div className="space-y-5">
          <PreviewCopyPanel page={page} compact />
          <div className="grid gap-4 md:grid-cols-2">
            {photos.map((photo) => (
              <PreviewPhotoTile
                key={photo.id}
                photo={photo}
                accent={accent}
                className="min-h-[14rem]"
              />
            ))}
          </div>
        </div>
      );
    default:
      return (
        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <PreviewPhotoTile photo={photos[0]} accent={accent} className="min-h-[26rem]" emphasis="large" />
          <div className="space-y-4">
            <PreviewCopyPanel page={page} />
            {photos[1] ? (
              <PreviewPhotoTile
                photo={photos[1]}
                accent={accent}
                className="min-h-[10rem]"
              />
            ) : null}
          </div>
        </div>
      );
  }
}

function PreviewCopyPanel({
  page,
  compact,
  emphasis,
}: {
  page: BookPage;
  compact?: boolean;
  emphasis?: "text-first";
}) {
  return (
    <div
      className={`rounded-[2rem] border border-[#00000010] bg-white/82 p-5 ${compact ? "" : "h-full"} ${emphasis === "text-first" ? "lg:px-8 lg:py-8" : ""}`}
    >
      <div className="text-xs uppercase tracking-[0.2em] text-[#8b5a40]">
        {getPageStoryBeat(page).replaceAll("_", " ")}
      </div>
      <h2 className="display mt-3 text-3xl leading-none text-[#211a16] sm:text-4xl">
        {page.title}
      </h2>
      <p className="mt-4 max-w-2xl text-sm leading-8 text-[#5d524b]">{page.caption}</p>
      <div className="mt-5 rounded-[1.3rem] bg-[#f7f0ea] px-4 py-4">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#7d7067]">
          Editorial intent
        </div>
        <p className="mt-2 text-sm leading-7 text-[#5f544d]">
          {page.curationNote ?? page.layoutNote}
        </p>
      </div>
    </div>
  );
}

function PreviewPhotoTile({
  photo,
  accent,
  className,
  emphasis,
}: {
  photo?: PhotoAsset;
  accent: string;
  className: string;
  emphasis?: "large";
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[2rem] border border-[#00000010] bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(233,224,215,0.96))] ${className}`}
      style={{
        boxShadow:
          emphasis === "large" ? `inset 0 0 0 1px ${accent}22` : undefined,
      }}
    >
      {photo?.imageUri ? (
        <>
          <img src={photo.imageUri} alt={photo.title} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(18,12,9,0.08),rgba(18,12,9,0.32))]" />
        </>
      ) : (
        <div
          className="absolute inset-0 opacity-80"
          style={{
            background: `radial-gradient(circle at top left, rgba(255,255,255,0.92), ${accent}18)`,
          }}
        />
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
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
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
    <span
      className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${toneClass}`}
    >
      {children}
    </span>
  );
}

function getPagePhotos(project: Project, page: BookPage) {
  return page.photoIds
    .map((photoId) => project.photos.find((photo) => photo.id === photoId))
    .filter((photo): photo is PhotoAsset => Boolean(photo));
}

function getPageStoryBeat(page: BookPage) {
  if (page.storyBeat) {
    return page.storyBeat;
  }

  if (page.style === "hero" || page.style === "full_bleed") {
    return "opener";
  }

  if (page.style === "recap" || page.style === "closing") {
    return "closing";
  }

  return "details";
}
