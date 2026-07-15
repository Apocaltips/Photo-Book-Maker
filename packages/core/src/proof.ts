import {
  getBookDraftFormatId,
  getPreviewDraft,
} from "./editorial";
import type {
  AiCropRegion,
  BookDraftFormatId,
  BookPage,
  PhotoAsset,
  Project,
  ProofExportRequest,
} from "./types";

type ProofLayout = "opener" | "hero" | "detail-grid" | "quiet" | "scene";
type CaptionPosition =
  | "bottom-left"
  | "bottom-right"
  | "lower-center"
  | "mid-left"
  | "mid-right"
  | "top-left"
  | "top-center"
  | "top-right";

type ProofPrintDimensions = {
  height: number;
  heightIn: number;
  width: number;
  widthIn: number;
};

function escapeHtml(value?: string | null) {
  return (value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatProjectMeta(project: Project) {
  return `${formatShortDate(project.startDate)} - ${formatShortDate(project.endDate)}`;
}

function formatShortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function getProofPrintDimensions(
  formatId: BookDraftFormatId,
): ProofPrintDimensions {
  switch (formatId) {
    case "8x8-square":
      return { height: 576, heightIn: 8, width: 576, widthIn: 8 };
    case "10x10-square":
      return { height: 720, heightIn: 10, width: 720, widthIn: 10 };
    case "11x8.5-landscape":
      return { height: 612, heightIn: 8.5, width: 792, widthIn: 11 };
    case "12x12-square":
    default:
      return { height: 864, heightIn: 12, width: 864, widthIn: 12 };
  }
}

function findPagePhotos(page: BookPage, project: Project) {
  return page.photoIds
    .map((photoId) => project.photos.find((photo) => photo.id === photoId))
    .filter((photo): photo is PhotoAsset => Boolean(photo));
}

function cleanPrintCopy(value?: string | null, fallback = "") {
  const normalized = (value ?? fallback).trim().replace(/\s+/g, " ");
  if (!normalized) {
    return fallback;
  }

  return normalized
    .replace(/[^.!?]*\b(?:validator|template|spread|AI selected)\b[^.!?]*[.!?]?/gi, " ")
    .replace(/[^.!?]*\b(?:stock|testing|test set|fixture|debug|sample dataset)\b[^.!?]*[.!?]?/gi, " ")
    .replace(/\bMadeira,\s*Madeira\b/gi, "Madeira")
    .replace(/\s+/g, " ")
    .trim() || fallback;
}

function cleanPhotoBookTitle(value?: string | null, fallback = "Photo Book") {
  const cleaned = cleanPrintCopy(value, fallback)
    .replace(/\b\d+\s+photo\s+trip\b/gi, "")
    .replace(/\b\d{8,}\b/g, "")
    .replace(/\b(?:stock|testing|test set|fixture|debug|sample dataset)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fallback;
}

function getPrintTitle(project: Project, title?: string | null) {
  const place = getProjectPlace(project);
  const cleanedTitle = cleanPhotoBookTitle(title || project.title, place);
  const placePrefix = place && cleanedTitle.toLowerCase() !== place.toLowerCase()
    ? cleanedTitle
    : place;

  return cleanPhotoBookTitle(placePrefix, place || "Photo Book");
}

function getPrintSubtitle(project: Project, subtitle?: string | null) {
  const cleaned = cleanPrintCopy(subtitle || project.subtitle, "");

  if (!cleaned || /\b(?:stock|testing|test set|fixture|debug|sample dataset)\b/i.test(cleaned)) {
    return `A curated photo story from ${getProjectPlace(project)}.`;
  }

  return cleaned;
}

function getProjectPlace(project: Project) {
  return (
    project.subtitle.match(
      /\b(?:Madeira|Funchal|Porto Moniz|Camara de Lobos|Câmara de Lobos|Cap Cana|Dominican Republic|Punta Cana)\b/i,
    )?.[0] ??
    project.title.match(
      /\b(?:Madeira|Funchal|Porto Moniz|Camara de Lobos|Câmara de Lobos|Cap Cana|Dominican Republic|Punta Cana)\b/i,
    )?.[0] ??
    project.photos.map((photo) => photo.locationLabel).find(Boolean)?.replace(/,.*$/, "") ??
    (project.subtitle ||
    project.title
    )
  ).replace(/\bMadeira,\s*Madeira\b/gi, "Madeira");
}

function getFallbackCaption(project: Project, page: BookPage, photos: PhotoAsset[]) {
  const place =
    photos.map((photo) => photo.locationLabel).find(Boolean) ?? getProjectPlace(project);

  switch (page.storyBeat) {
    case "opener":
      return `${place} opens the trip with the image that best sets the tone.`;
    case "scene_setter":
      return `The route, arrival, and first impressions give this chapter its sense of place.`;
    case "details":
      return `The smaller details give the trip texture beyond the headline moments.`;
    case "reflection":
      return `A quieter pause for the feeling behind the photos.`;
    case "closing":
      return `A final page for the memory this book should keep.`;
    case "highlight":
    default:
      return `${place} gets a full moment on the page.`;
  }
}

function getFallbackTitle(project: Project, page: BookPage, index: number) {
  if (page.title.trim()) {
    return page.title;
  }

  const place = getProjectPlace(project);
  const titles: Record<BookPage["storyBeat"], string> = {
    closing: "The Part We Keep",
    details: "Details Worth Saving",
    highlight: `${place} In Focus`,
    opener: `${project.title} Begins`,
    reflection: "The Quiet Middle",
    scene_setter: "Setting The Scene",
  };

  return titles[page.storyBeat] ?? `Memory ${index + 1}`;
}

function getProofLayout(page: BookPage, index: number, photos: PhotoAsset[]): ProofLayout {
  if (index === 0 || page.storyBeat === "opener") {
    return "opener";
  }

  if (page.storyBeat === "scene_setter" || page.style === "timeline" || page.style === "map_timeline") {
    return "scene";
  }

  if (
    page.storyBeat === "details" ||
    photos.length >= 4 ||
    page.style === "collage" ||
    page.style === "family_recap" ||
    page.style === "minimal_grid"
  ) {
    return "detail-grid";
  }

  if (
    page.storyBeat === "reflection" ||
    page.storyBeat === "closing" ||
    page.style === "caption" ||
    page.style === "closing"
  ) {
    return "quiet";
  }

  return "hero";
}

function getCaptionPosition(
  layout: ProofLayout,
  page: BookPage,
  index: number,
  photos: PhotoAsset[],
): CaptionPosition {
  if (layout === "opener") {
    return index % 4 === 0 ? "bottom-left" : "bottom-right";
  }

  if (layout === "detail-grid") {
    const detailPositions: CaptionPosition[] = [
      "top-left",
      "bottom-right",
      "mid-left",
      "top-center",
      "mid-right",
      "top-right",
      "bottom-left",
    ];
    const offset = (page.layoutVariation ?? 0) + index + photos.length;
    return detailPositions[offset % detailPositions.length]!;
  }

  if (layout === "scene") {
    return index % 3 === 0 ? "top-center" : index % 2 === 0 ? "top-right" : "bottom-left";
  }

  if (page.storyBeat === "closing") {
    return "lower-center";
  }

  if (layout === "quiet" || page.storyBeat === "reflection") {
    return photos.length <= 1
      ? index % 2 === 0
        ? "lower-center"
        : "bottom-right"
      : index % 2 === 0
        ? "top-left"
        : "mid-right";
  }

  return index % 4 === 0
    ? "bottom-left"
    : index % 4 === 1
      ? "top-right"
      : index % 4 === 2
        ? "bottom-right"
        : "top-left";
}

function getPhotoClassName(photo: PhotoAsset | undefined, index: number) {
  return [
    "photo-frame",
    `slot-${index + 1}`,
    photo?.orientation ? `photo-${photo.orientation}` : "photo-unknown",
  ].join(" ");
}

function getObjectPosition(region?: AiCropRegion) {
  switch (region) {
    case "top":
    case "face":
      return "50% 28%";
    case "bottom":
      return "50% 72%";
    case "left":
      return "28% 50%";
    case "right":
      return "72% 50%";
    case "wide":
    case "safe-full":
    case "center":
    default:
      return "50% 50%";
  }
}

function getCropRegionForPhoto(page: BookPage, photoId: string): AiCropRegion {
  return (
    page.cropIntents?.find((crop) => crop.photoId === photoId)?.region ??
    "center"
  );
}

function renderPhoto(photo: PhotoAsset | undefined, index: number, cropRegion?: AiCropRegion) {
  const className = getPhotoClassName(photo, index);

  if (!photo?.imageUri) {
    return `
      <figure class="${className} placeholder">
        <span>Photo still syncing</span>
      </figure>
    `;
  }

  return `
    <figure class="${className}" data-photo-id="${escapeHtml(photo.id)}">
      <img src="${escapeHtml(photo.imageUri)}" alt="${escapeHtml(photo.title)}" style="object-position: ${getObjectPosition(cropRegion)};" />
    </figure>
  `;
}

function renderGuideOverlays(request?: Partial<ProofExportRequest>) {
  return [
    request?.includeBleedGuides
      ? `<div class="guide guide-bleed" aria-hidden="true"></div><div class="guide-label bleed-label">Bleed guide</div>`
      : "",
    request?.includePrintSafeGuides
      ? `<div class="guide guide-safe" aria-hidden="true"></div><div class="guide-label safe-label">Safe text area</div>`
      : "",
  ].join("");
}

function getCoverPhotoScore(photo: PhotoAsset, firstPagePhotoIds: Set<string>) {
  const haystack = [
    photo.title,
    photo.locationLabel,
    ...photo.qualityNotes,
  ].join(" ").toLowerCase();
  let score = 0;

  if (!photo.imageUri) {
    return -1000;
  }

  if (!firstPagePhotoIds.has(photo.id)) {
    score += 35;
  }

  if (photo.orientation === "landscape") {
    score += 32;
  } else if (photo.orientation === "square") {
    score += 16;
  } else if (photo.orientation === "portrait") {
    score -= 36;
  }

  if (photo.mustInclude) {
    score += 12;
  }

  if (/\b(ocean|sea|beach|coast|coastal|harbor|harbour|bay|waterfront|promenade|pool|natural pools|piscinas|palm|mountain|viewpoint|sunset|sunrise|garden|island|resort|lagoon|marina|funchal|calheta|cabo girao|cabo girão|ribeira de janela|seixal)\b/.test(haystack)) {
    score += 54;
  }

  if (/\b(ponta do sol|camara de lobos|câmara de lobos|porto moniz|bay|baia|baía|bright|blue|sun)\b/.test(haystack)) {
    score += 34;
  }

  if (/\b(baia|baía|harbor|harbour|marina|blue|sun|beach|coastal|waterfront)\b/.test(haystack)) {
    score += 48;
  }

  if (/\b(water)\b/.test(haystack)) {
    score += 12;
  }

  if (/\b(fixer|run down|rundown|ruin|old castle|old building|fenced|diagram|map|flag|logo|bird|pile|trash|construction|cave|storm|cloudy|overcast|gray|grey|black and white|monochrome|bus|coach|shuttle|parking|rusty|recycled cans|commercial)\b/.test(haystack)) {
    score -= 95;
  }

  if (/\b(ribeira de janela|stone|rock|rocks)\b/.test(haystack)) {
    score -= 38;
  }

  const largestVersion = [...photo.versions].sort(
    (left, right) => right.width * right.height - left.width * left.height,
  )[0];
  if (largestVersion) {
    score += Math.min(24, Math.round((largestVersion.width * largestVersion.height) / 1_000_000));
  }

  return score;
}

function chooseCoverPhoto(project: Project, pages: BookPage[]) {
  const firstPagePhotoIds = new Set(pages[0]?.photoIds ?? []);
  const candidates = project.photos.filter((photo) => photo.imageUri);
  const pagePhotoCandidates = pages
    .flatMap((page, pageIndex) =>
      page.photoIds.map((photoId) => ({
        page,
        pageIndex,
        photo: project.photos.find((candidate) => candidate.id === photoId && candidate.imageUri),
      })),
    )
    .filter((entry): entry is { page: BookPage; pageIndex: number; photo: PhotoAsset } =>
      Boolean(entry.photo),
    );
  const usedStoryPhotoIds = new Set(pagePhotoCandidates.map((entry) => entry.photo.id));
  const unusedCandidates = candidates
    .filter((photo) => !usedStoryPhotoIds.has(photo.id))
    .map((photo) => ({
      page: undefined,
      pageIndex: 999,
      photo,
    }));
  const storyCandidates = pagePhotoCandidates.length ? pagePhotoCandidates : candidates.map((photo) => ({
    page: undefined,
    pageIndex: 999,
    photo,
  }));

  const scoreStoryCandidate = (entry: { page?: BookPage; pageIndex: number; photo: PhotoAsset }) => {
    let score = getCoverPhotoScore(entry.photo, firstPagePhotoIds);

    if (entry.page) {
      score += 42;
    }

    if (entry.page?.storyBeat === "highlight") {
      score += 96;
    } else if (entry.page?.storyBeat === "scene_setter" || entry.page?.storyBeat === "closing") {
      score += entry.page?.storyBeat === "closing" ? -16 : 34;
    } else if (entry.page?.storyBeat === "details") {
      score -= 40;
    }

    if (entry.pageIndex === 0) {
      score -= 48;
    }

    return score;
  };

  const sortedUnusedCandidates = [...unusedCandidates].sort(
    (left, right) => scoreStoryCandidate(right) - scoreStoryCandidate(left),
  );
  const sortedStoryCandidates = [...storyCandidates].sort(
    (left, right) => scoreStoryCandidate(right) - scoreStoryCandidate(left),
  );
  const bestUnusedCandidate = sortedUnusedCandidates[0];
  const bestStoryCandidate = sortedStoryCandidates[0];
  const shouldUseUnusedCover =
    bestUnusedCandidate &&
    (scoreStoryCandidate(bestUnusedCandidate) > 20 || !bestStoryCandidate);

  return (
    (shouldUseUnusedCover ? bestUnusedCandidate?.photo : bestStoryCandidate?.photo) ??
    project.photos.find((photo) => photo.mustInclude && photo.imageUri) ??
    project.photos.find((photo) => photo.imageUri) ??
    project.photos[0]
  );
}

function getPageLocation(project: Project, photos: PhotoAsset[]) {
  return (
    photos.map((photo) => photo.locationLabel).find(Boolean)?.replace(/,.*$/, "") ??
    getProjectPlace(project)
  ).replace(/\bMadeira,\s*Madeira\b/gi, "Madeira");
}

function renderCover(input: {
  coverPhoto?: PhotoAsset;
  draftName: string;
  formatId: BookDraftFormatId;
  project: Project;
  request?: Partial<ProofExportRequest>;
  subtitle: string;
  title: string;
}) {
  return `
    <section class="sheet cover-sheet">
      ${renderGuideOverlays(input.request)}
      <div class="cover-art">
        ${renderPhoto(input.coverPhoto, 0)}
      </div>
      <div class="cover-scrim"></div>
      <article class="cover-copy">
        <p class="kicker">Travel photo book</p>
        <h1>${escapeHtml(input.title)}</h1>
        <p class="dek">${escapeHtml(input.subtitle || `A curated photo story from ${getProjectPlace(input.project)}.`)}</p>
      </article>
      <div class="cover-footer">
        <span>${escapeHtml(formatProjectMeta(input.project))}</span>
        <span>${escapeHtml(getProjectPlace(input.project))}</span>
      </div>
    </section>
  `;
}

function renderSpread(
  page: BookPage,
  project: Project,
  index: number,
  request?: Partial<ProofExportRequest>,
) {
  const photos = findPagePhotos(page, project).slice(0, 4);
  const layout = getProofLayout(page, index, photos);
  const captionPosition = getCaptionPosition(layout, page, index, photos);
  const variation = Number.isFinite(page.layoutVariation) ? Math.abs(page.layoutVariation ?? 0) % 4 : index % 4;
  const title = cleanPrintCopy(getFallbackTitle(project, page, index), `Memory ${index + 1}`);
  const caption = cleanPrintCopy(
    page.caption,
    getFallbackCaption(project, page, photos),
  );
  const hasManyPhotos = photos.length >= 3;

  return `
    <section class="sheet story-sheet layout-${layout} photo-count-${photos.length} copy-${captionPosition} variation-${variation}">
      ${renderGuideOverlays(request)}
      <header class="page-kicker">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <span>${escapeHtml(getPageLocation(project, photos))}</span>
      </header>
      <div class="story-media ${hasManyPhotos ? "many" : "few"}">
        ${photos.length ? photos.map((photo, photoIndex) => renderPhoto(photo, photoIndex, getCropRegionForPhoto(page, photo.id))).join("") : renderPhoto(undefined, 0)}
      </div>
      <article class="story-copy">
        <p class="kicker">${escapeHtml(getProjectPlace(project))}</p>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(caption)}</p>
      </article>
    </section>
  `;
}

export function buildProofHtml(project: Project, request?: Partial<ProofExportRequest>) {
  const preview = getPreviewDraft(project, request?.draftId);
  const activeDraft = preview.draft;
  const formatId = getBookDraftFormatId(activeDraft.format);
  const dimensions = getProofPrintDimensions(formatId);
  const selectedTheme =
    project.bookThemes.find((theme) => theme.id === preview.selectedThemeId) ??
    project.bookThemes[0];
  const coverPhoto = chooseCoverPhoto(project, activeDraft.pages);
  const accent = selectedTheme?.accent ?? "#0f766e";
  const title = getPrintTitle(project, preview.title);
  const subtitle = getPrintSubtitle(project, preview.subtitle);

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)} proof</title>
        <style>
          :root {
            --accent: ${accent};
            --accent-dark: #14545a;
            --coral: #d26545;
            --ink: #201a16;
            --muted: #675d54;
            --paper: #fbf7ef;
            --paper-cool: #eef4f3;
            --line: rgba(32, 26, 22, 0.14);
            --safe: rgba(210, 101, 69, 0.48);
            --bleed: rgba(20, 84, 90, 0.42);
            --page-width: ${dimensions.widthIn}in;
            --page-height: ${dimensions.heightIn}in;
          }
          * { box-sizing: border-box; }
          html, body {
            margin: 0;
            min-height: 100%;
            background: #ffffff;
          }
          body {
            color: var(--ink);
            font-family: "Avenir Next", "Helvetica Neue", Arial, sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          h1, h2, p, figure {
            margin: 0;
          }
          h1, h2 {
            font-family: Georgia, "Times New Roman", serif;
            font-weight: 650;
            letter-spacing: 0;
          }
          .sheet {
            break-after: page;
            height: var(--page-height);
            overflow: hidden;
            page-break-after: always;
            position: relative;
            width: var(--page-width);
          }
          .sheet:last-child {
            break-after: auto;
            page-break-after: auto;
          }
          .kicker, .page-kicker, .cover-footer {
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.18em;
            line-height: 1.4;
            text-transform: uppercase;
          }
          .photo-frame {
            background: linear-gradient(135deg, #dfe7e3, #eee4da);
            overflow: hidden;
            position: relative;
          }
          .photo-frame img {
            display: block;
            height: 100%;
            object-fit: cover;
            width: 100%;
          }
          .placeholder {
            align-items: center;
            color: var(--muted);
            display: flex;
            font-size: 11px;
            font-weight: 800;
            justify-content: center;
            letter-spacing: 0.14em;
            padding: 0.2in;
            text-align: center;
            text-transform: uppercase;
          }
          .cover-sheet {
            background: #15120f;
            color: #fff8ee;
          }
          .cover-art {
            inset: 0;
            position: absolute;
          }
          .cover-art .photo-frame {
            border-radius: 0;
            border: 0;
            box-shadow: none;
            height: 100%;
            outline: 0;
            width: 100%;
          }
          .cover-scrim {
            background:
              linear-gradient(90deg, rgba(16, 13, 10, 0.58), rgba(16, 13, 10, 0.08) 54%, rgba(16, 13, 10, 0.34)),
              linear-gradient(180deg, rgba(16, 13, 10, 0.02), rgba(16, 13, 10, 0.38));
            inset: 0;
            position: absolute;
          }
          .cover-copy {
            bottom: 1.05in;
            left: 0.72in;
            max-width: min(5.5in, 58%);
            position: absolute;
            z-index: 3;
          }
          .cover-copy .kicker {
            color: #f0b08e;
            margin-bottom: 0.22in;
          }
          .cover-copy h1 {
            font-size: 0.54in;
            line-height: 0.94;
            max-width: 10ch;
            text-shadow: 0 0.05in 0.2in rgba(0, 0, 0, 0.46);
          }
          .cover-copy .dek {
            color: #f8e9da;
            font-size: 0.15in;
            line-height: 1.7;
            margin-top: 0.24in;
            max-width: 34ch;
          }
          .cover-footer {
            bottom: 0.48in;
            color: rgba(255, 248, 238, 0.78);
            display: flex;
            gap: 0.28in;
            justify-content: space-between;
            left: 0.72in;
            position: absolute;
            right: 0.72in;
            z-index: 3;
          }
          .story-sheet {
            background: #11100e;
            display: block;
            padding: 0;
          }
          .story-sheet.photo-count-2,
          .story-sheet.photo-count-3,
          .story-sheet.photo-count-4 {
            background:
              radial-gradient(circle at 18% 16%, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0) 36%),
              linear-gradient(135deg, #f7f1e8, #e7dacb 58%, #fbf8f1);
            color: #241f1a;
          }
          .story-sheet::before {
            background: var(--coral);
            content: "";
            height: 0.05in;
            left: 0.42in;
            position: absolute;
            top: 0.42in;
            width: 0.42in;
            z-index: 8;
          }
          .story-sheet.photo-count-2::before,
          .story-sheet.photo-count-3::before,
          .story-sheet.photo-count-4::before {
            background: rgba(210, 101, 69, 0.58);
          }
          .story-media {
            display: grid;
            gap: 0.045in;
            inset: 0;
            min-height: 0;
            position: absolute;
            z-index: 1;
          }
          .story-media::after {
            background:
              linear-gradient(180deg, rgba(12, 11, 10, 0.34), rgba(12, 11, 10, 0.04) 26%, rgba(12, 11, 10, 0.08) 55%, rgba(12, 11, 10, 0.62)),
              linear-gradient(90deg, rgba(12, 11, 10, 0.44), rgba(12, 11, 10, 0.03) 42%, rgba(12, 11, 10, 0.16));
            content: "";
            inset: 0;
            pointer-events: none;
            position: absolute;
            z-index: 2;
          }
          .story-media.few {
            gap: 0;
          }
          .photo-count-2 .story-media,
          .photo-count-3 .story-media,
          .photo-count-4 .story-media {
            background:
              linear-gradient(135deg, rgba(255, 252, 246, 0.72), rgba(255, 252, 246, 0.36)),
              radial-gradient(circle at 78% 18%, rgba(210, 101, 69, 0.09), rgba(210, 101, 69, 0) 35%);
            border: 1px solid rgba(64, 52, 40, 0.12);
            box-shadow:
              inset 0 0 0 0.012in rgba(255, 255, 255, 0.62),
              0 0.1in 0.34in rgba(64, 52, 40, 0.14);
            gap: 0.12in;
            inset: 0.5in;
            overflow: visible;
            padding: 0.06in;
          }
          .photo-count-2 .story-media::before,
          .photo-count-3 .story-media::before,
          .photo-count-4 .story-media::before {
            background: radial-gradient(circle at 18% 28%, rgba(255, 255, 255, 0.46), rgba(255, 255, 255, 0) 40%);
            content: "";
            inset: -0.16in;
            pointer-events: none;
            position: absolute;
            z-index: 0;
          }
          .photo-count-2 .story-media::after,
          .photo-count-3 .story-media::after,
          .photo-count-4 .story-media::after {
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0) 50%, rgba(64, 52, 40, 0.08));
          }
          .story-media .photo-frame {
            border-radius: 0;
            height: 100%;
            min-height: 0;
            width: 100%;
          }
          .photo-count-2 .story-media .photo-frame,
          .photo-count-3 .story-media .photo-frame,
          .photo-count-4 .story-media .photo-frame {
            border: 0.038in solid rgba(255, 253, 248, 0.98);
            box-shadow:
              0 0 0 1px rgba(80, 64, 48, 0.16),
              0 0.045in 0.13in rgba(64, 52, 40, 0.22),
              0 0.16in 0.32in rgba(64, 52, 40, 0.18);
            outline: 1px solid rgba(255, 255, 255, 0.58);
            transform-origin: center;
            z-index: 3;
          }
          .photo-count-2 .story-media .slot-1,
          .photo-count-3 .story-media .slot-1,
          .photo-count-4 .story-media .slot-1 {
            transform: translate(-0.015in, -0.012in);
          }
          .photo-count-2 .story-media .slot-2,
          .photo-count-3 .story-media .slot-2,
          .photo-count-4 .story-media .slot-2 {
            transform: translate(0.018in, 0.01in);
          }
          .photo-count-3 .story-media .slot-3,
          .photo-count-4 .story-media .slot-3 {
            transform: translate(-0.008in, 0.018in);
          }
          .photo-count-4 .story-media .slot-4 {
            transform: translate(0.014in, -0.006in);
          }
          .page-kicker {
            color: rgba(255, 248, 238, 0.78);
            display: flex;
            justify-content: space-between;
            left: 0.42in;
            position: absolute;
            right: 0.42in;
            text-shadow: 0 1px 8px rgba(0, 0, 0, 0.56);
            top: 0.38in;
            z-index: 9;
          }
          .story-sheet.photo-count-2 .page-kicker,
          .story-sheet.photo-count-3 .page-kicker,
          .story-sheet.photo-count-4 .page-kicker {
            color: rgba(36, 31, 26, 0.52);
            text-shadow: none;
          }
          .story-copy {
            background: transparent;
            border: 0;
            bottom: 0.48in;
            color: #fffaf0;
            left: 0.48in;
            max-width: min(4.9in, 52%);
            padding: 0;
            position: absolute;
            text-shadow:
              0 0.035in 0.16in rgba(0, 0, 0, 0.7),
              0 0 0.03in rgba(0, 0, 0, 0.86);
            z-index: 7;
          }
          .story-copy::before {
            background:
              linear-gradient(90deg, rgba(13, 11, 10, 0.74), rgba(13, 11, 10, 0.5) 58%, rgba(13, 11, 10, 0));
            bottom: -0.25in;
            content: "";
            left: -0.28in;
            position: absolute;
            top: -0.25in;
            width: min(6.6in, 138%);
            z-index: -1;
          }
          .story-copy::after {
            background: rgba(242, 177, 143, 0.9);
            content: "";
            height: 0.022in;
            left: 0;
            position: absolute;
            top: -0.12in;
            width: 0.62in;
          }
          .story-copy .kicker {
            color: #f2b18f;
            margin-bottom: 0.09in;
          }
          .story-copy h2 {
            color: #fffaf0;
            font-size: 0.36in;
            line-height: 0.96;
            max-width: 12ch;
          }
          .story-copy p {
            color: rgba(255, 250, 240, 0.88);
            font-size: 0.105in;
            line-height: 1.44;
            margin-top: 0.12in;
            max-width: 34ch;
          }
          .layout-opener .story-media,
          .layout-hero.photo-count-1 .story-media,
          .layout-quiet.photo-count-1 .story-media {
            display: block;
          }
          .layout-opener .story-media .photo-frame,
          .layout-hero.photo-count-1 .story-media .photo-frame,
          .layout-quiet.photo-count-1 .story-media .photo-frame {
            inset: 0;
            position: absolute;
          }
          .layout-opener .story-media .photo-frame:not(:first-child),
          .layout-hero.photo-count-1 .story-media .photo-frame:not(:first-child),
          .layout-quiet.photo-count-1 .story-media .photo-frame:not(:first-child) {
            display: none;
          }
          .layout-opener .story-copy,
          .layout-hero.photo-count-1 .story-copy {
            max-width: min(5.2in, 55%);
          }
          .layout-opener .story-copy h2 {
            font-size: 0.48in;
          }
          .layout-hero:not(.photo-count-1) .story-media {
            grid-template-columns: minmax(0, 1.78fr) minmax(0, 0.72fr);
            grid-template-rows: repeat(3, minmax(0, 1fr));
          }
          .layout-hero.photo-count-2 .story-media {
            grid-template-columns: minmax(0, 1.18fr) minmax(0, 0.82fr);
            grid-template-rows: minmax(0, 1fr);
          }
          .layout-hero.photo-count-3 .story-media {
            grid-template-columns: minmax(0, 1.42fr) minmax(0, 0.88fr);
            grid-template-rows: repeat(2, minmax(0, 1fr));
          }
          .layout-hero:not(.photo-count-1) .slot-1 {
            grid-row: 1 / -1;
          }
          .layout-hero.photo-count-3 .slot-3 {
            grid-column: 2;
            grid-row: 2;
          }
          .layout-hero:not(.photo-count-1) .photo-frame:nth-child(n+5) {
            display: none;
          }
          .layout-scene.photo-count-1 .story-media,
          .layout-detail-grid.photo-count-1 .story-media {
            display: block;
          }
          .layout-scene.photo-count-1 .story-media .photo-frame,
          .layout-detail-grid.photo-count-1 .story-media .photo-frame {
            inset: 0;
            position: absolute;
          }
          .layout-scene:not(.photo-count-1) .story-media {
            grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
            grid-template-rows: minmax(0, 1fr);
          }
          .layout-scene.variation-1:not(.photo-count-1) .story-media,
          .layout-scene.variation-3:not(.photo-count-1) .story-media {
            grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
          }
          .layout-scene:not(.photo-count-1) .photo-frame:nth-child(n+3) {
            display: none;
          }
          .layout-detail-grid .story-media {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            grid-template-rows: repeat(2, minmax(0, 1fr));
          }
          .layout-detail-grid.variation-1.photo-count-4 .story-media {
            grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr) minmax(0, 0.85fr);
            grid-template-rows: repeat(2, minmax(0, 1fr));
          }
          .layout-detail-grid.variation-1.photo-count-4 .slot-1 {
            grid-row: 1 / -1;
          }
          .layout-detail-grid.variation-1.photo-count-4 .slot-4 {
            grid-column: 2 / -1;
          }
          .layout-detail-grid.variation-2.photo-count-4 .story-media {
            grid-template-columns: minmax(0, 0.85fr) minmax(0, 0.85fr) minmax(0, 1.15fr);
            grid-template-rows: repeat(2, minmax(0, 1fr));
          }
          .layout-detail-grid.variation-2.photo-count-4 .slot-3 {
            grid-row: 1 / -1;
            grid-column: 3;
          }
          .layout-detail-grid.variation-2.photo-count-4 .slot-4 {
            grid-column: 1 / 3;
          }
          .layout-detail-grid.variation-3.photo-count-4 .story-media {
            grid-template-columns: repeat(4, minmax(0, 1fr));
            grid-template-rows: minmax(0, 1fr);
          }
          .layout-detail-grid.photo-count-2 .story-media,
          .layout-quiet.photo-count-2 .story-media {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            grid-template-rows: minmax(0, 1fr);
          }
          .layout-detail-grid.photo-count-3 .story-media,
          .layout-quiet.photo-count-3 .story-media {
            grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.85fr);
            grid-template-rows: repeat(2, minmax(0, 1fr));
          }
          .layout-detail-grid.photo-count-3 .slot-1,
          .layout-quiet.photo-count-3 .slot-1 {
            grid-row: 1 / -1;
          }
          .layout-quiet:not(.photo-count-1):not(.photo-count-2):not(.photo-count-3) .story-media {
            grid-template-columns: minmax(0, 1.28fr) minmax(0, 0.72fr);
            grid-template-rows: repeat(2, minmax(0, 1fr));
          }
          .layout-quiet:not(.photo-count-1):not(.photo-count-2):not(.photo-count-3) .slot-1 {
            grid-row: 1 / -1;
          }
          .layout-quiet .story-copy {
            bottom: 0.52in;
            max-width: min(6.2in, 66%);
          }
          .layout-quiet .story-copy h2 {
            font-size: 0.34in;
            max-width: 16ch;
          }
          .layout-detail-grid:not(.photo-count-2):not(.photo-count-3):not(.photo-count-4) .story-copy,
          .layout-scene:not(.photo-count-2):not(.photo-count-3):not(.photo-count-4) .story-copy {
            bottom: 0.42in;
            max-width: min(4.5in, 48%);
          }
          .photo-count-2 .story-copy,
          .photo-count-3 .story-copy,
          .photo-count-4 .story-copy {
            background: rgba(255, 252, 246, 0.94);
            border: 1px solid rgba(64, 52, 40, 0.15);
            box-shadow:
              0 0.05in 0.16in rgba(64, 52, 40, 0.16),
              0 0.12in 0.32in rgba(64, 52, 40, 0.12);
            color: #241f1a;
            max-width: min(3.65in, 42%);
            padding: 0.13in 0.15in 0.14in;
            text-shadow: none;
          }
          .photo-count-2 .story-copy::before,
          .photo-count-3 .story-copy::before,
          .photo-count-4 .story-copy::before {
            display: none;
          }
          .photo-count-2 .story-copy::after,
          .photo-count-3 .story-copy::after,
          .photo-count-4 .story-copy::after {
            background: rgba(210, 101, 69, 0.82);
            top: -0.075in;
            width: 0.42in;
          }
          .photo-count-2 .story-copy .kicker,
          .photo-count-3 .story-copy .kicker,
          .photo-count-4 .story-copy .kicker {
            color: #9f513b;
          }
          .photo-count-2 .story-copy h2,
          .photo-count-3 .story-copy h2,
          .photo-count-4 .story-copy h2 {
            color: #241f1a;
            font-size: 0.24in;
            line-height: 1;
            max-width: 15ch;
          }
          .photo-count-2 .story-copy p,
          .photo-count-3 .story-copy p,
          .photo-count-4 .story-copy p {
            color: rgba(36, 31, 26, 0.72);
            font-size: 0.083in;
            line-height: 1.36;
            max-width: 31ch;
          }
          .layout-detail-grid:not(.photo-count-2):not(.photo-count-3):not(.photo-count-4) .story-copy h2,
          .layout-scene:not(.photo-count-2):not(.photo-count-3):not(.photo-count-4) .story-copy h2 {
            font-size: 0.3in;
            max-width: 13ch;
          }
          .layout-detail-grid:not(.photo-count-2):not(.photo-count-3):not(.photo-count-4) .story-copy p,
          .layout-scene:not(.photo-count-2):not(.photo-count-3):not(.photo-count-4) .story-copy p {
            font-size: 0.095in;
            max-width: 30ch;
          }
          .copy-bottom-right .story-copy,
          .copy-top-right .story-copy {
            left: auto;
            right: 0.5in;
            text-align: right;
          }
          .copy-bottom-right .story-copy::before,
          .copy-top-right .story-copy::before {
            background:
              linear-gradient(270deg, rgba(13, 11, 10, 0.74), rgba(13, 11, 10, 0.5) 58%, rgba(13, 11, 10, 0));
            left: auto;
            right: -0.28in;
          }
          .copy-bottom-right .story-copy::after,
          .copy-top-right .story-copy::after {
            left: auto;
            right: 0;
          }
          .copy-top-left .story-copy,
          .copy-top-right .story-copy {
            bottom: auto;
            top: 0.96in;
          }
          .copy-mid-left .story-copy,
          .copy-mid-right .story-copy {
            bottom: auto;
            top: 50%;
            transform: translateY(-50%);
          }
          .copy-mid-right .story-copy {
            left: auto;
            right: 0.5in;
            text-align: right;
          }
          .copy-mid-right .story-copy::before {
            background:
              linear-gradient(270deg, rgba(13, 11, 10, 0.74), rgba(13, 11, 10, 0.5) 58%, rgba(13, 11, 10, 0));
            left: auto;
            right: -0.28in;
          }
          .copy-mid-right .story-copy::after {
            left: auto;
            right: 0;
          }
          .copy-top-center .story-copy {
            bottom: auto;
            left: 50%;
            max-width: min(4.8in, 52%);
            text-align: center;
            top: 0.68in;
            transform: translateX(-50%);
          }
          .copy-top-center .story-copy::before {
            background:
              linear-gradient(90deg, rgba(13, 11, 10, 0), rgba(13, 11, 10, 0.64) 18%, rgba(13, 11, 10, 0.64) 82%, rgba(13, 11, 10, 0));
            left: 50%;
            transform: translateX(-50%);
            width: 124%;
          }
          .copy-top-center .story-copy::after {
            left: 50%;
            transform: translateX(-50%);
          }
          .copy-lower-center .story-copy {
            bottom: 0.46in;
            left: 50%;
            max-width: min(5.6in, 62%);
            text-align: center;
            transform: translateX(-50%);
          }
          .copy-lower-center .story-copy::before {
            background:
              linear-gradient(90deg, rgba(13, 11, 10, 0), rgba(13, 11, 10, 0.64) 18%, rgba(13, 11, 10, 0.64) 82%, rgba(13, 11, 10, 0));
            left: 50%;
            transform: translateX(-50%);
            width: 132%;
          }
          .copy-lower-center .story-copy::after {
            left: 50%;
            transform: translateX(-50%);
          }
          .copy-top-left .story-copy::before,
          .copy-top-right .story-copy::before {
            bottom: -0.22in;
            top: -0.2in;
          }
          .guide {
            border-style: dashed;
            border-width: 1px;
            pointer-events: none;
            position: absolute;
            z-index: 20;
          }
          .guide-safe {
            border-color: var(--safe);
            inset: 6%;
          }
          .guide-bleed {
            border-color: var(--bleed);
            inset: 2%;
          }
          .guide-label {
            background: rgba(255, 252, 248, 0.9);
            border: 1px solid var(--safe);
            color: var(--coral);
            font-size: 9px;
            font-weight: 800;
            letter-spacing: 0.12em;
            padding: 4px 8px;
            position: absolute;
            right: 0.18in;
            text-transform: uppercase;
            z-index: 21;
          }
          .safe-label { top: 0.18in; }
          .bleed-label {
            border-color: var(--bleed);
            color: var(--accent-dark);
            top: 0.45in;
          }
          @page {
            margin: 0;
            size: ${dimensions.widthIn}in ${dimensions.heightIn}in;
          }
          @media screen {
            body {
              align-items: center;
              background: #ece7df;
              display: flex;
              flex-direction: column;
              gap: 24px;
              padding: 24px;
            }
            .sheet {
              box-shadow: 0 20px 70px rgba(32, 26, 22, 0.16);
            }
          }
          @media print {
            body {
              background: #ffffff;
              display: block;
              padding: 0;
            }
            .sheet {
              box-shadow: none;
            }
          }
        </style>
      </head>
      <body>
        ${renderCover({
          coverPhoto,
          draftName: preview.name,
          formatId,
          project,
          request,
          subtitle,
          title,
        })}
        ${activeDraft.pages.map((page, index) => renderSpread(page, project, index, request)).join("")}
      </body>
    </html>
  `;
}
