import type { BookPage, PhotoAsset, Project } from "./core";
import {
  getCanvasAspectRatio,
  getStoryLayoutLabel,
  mapBookFormatToLayoutFormat,
  selectStoryLayout,
} from "./story-layout-engine";

type ProofTheme = {
  accent: string;
  coverWash: string;
  muted: string;
  paper: string;
  serif: string;
  sans: string;
  surface: string;
};

function getProofTheme(project: Project): ProofTheme {
  switch (project.selectedThemeId) {
    case "pine-ink":
      return {
        accent: "#335c52",
        coverWash: "linear-gradient(135deg, rgba(20,37,32,0.1), rgba(51,92,82,0.28))",
        muted: "#597067",
        paper: "#eef2ed",
        serif: '"Palatino Linotype", "Book Antiqua", Palatino, serif',
        sans: '"Avenir Next", "Helvetica Neue", Arial, sans-serif',
        surface: "rgba(245,249,246,0.95)",
      };
    case "coastline":
      return {
        accent: "#5e759f",
        coverWash: "linear-gradient(135deg, rgba(39,56,86,0.08), rgba(106,126,168,0.24))",
        muted: "#667998",
        paper: "#eff3f8",
        serif: 'Didot, "Bodoni 72", Georgia, serif',
        sans: '"Helvetica Neue", Arial, sans-serif',
        surface: "rgba(250,252,255,0.95)",
      };
    default:
      return {
        accent: "#c76c3a",
        coverWash: "linear-gradient(135deg, rgba(108,53,26,0.08), rgba(199,108,58,0.26))",
        muted: "#7c6658",
        paper: "#f8f2ea",
        serif: 'Georgia, "Times New Roman", serif',
        sans: '"Avenir Next", "Helvetica Neue", Arial, sans-serif',
        surface: "rgba(255,251,246,0.95)",
      };
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}

function findPagePhotos(page: BookPage, project: Project) {
  return page.photoIds
    .map((photoId) => project.photos.find((photo) => photo.id === photoId))
    .filter((photo): photo is PhotoAsset => Boolean(photo));
}

function formatProjectMeta(project: Project) {
  return `${project.startDate} to ${project.endDate} • ${project.timezone}`;
}

function renderCanvasElement(
  element: ReturnType<typeof selectStoryLayout>["active"]["elements"][number],
) {
  const positionStyle = [
    `left:${element.position.x * 100}%;`,
    `top:${element.position.y * 100}%;`,
    `width:${element.position.w * 100}%;`,
    `height:${element.position.h * 100}%;`,
    `z-index:${element.zIndex};`,
  ].join("");

  if (element.type === "image") {
    const imageSrc = element.photo?.imageUri;
    const title = escapeAttribute(element.photo?.title ?? "Photo");

    return `
      <div class="story-image ${element.variant ?? "support"}" style="${positionStyle}">
        ${
          imageSrc
            ? `<img src="${escapeAttribute(imageSrc)}" alt="${title}" />`
            : `<div class="story-placeholder">${escapeHtml(element.photo?.title ?? "Missing photo")}</div>`
        }
      </div>
    `;
  }

  return `
    <div class="story-text ${element.variant}" style="${positionStyle}">
      ${element.eyebrow ? `<div class="story-eyebrow">${escapeHtml(element.eyebrow)}</div>` : ""}
      ${element.title ? `<h2>${escapeHtml(element.title)}</h2>` : ""}
      ${element.body ? `<p>${escapeHtml(element.body)}</p>` : ""}
    </div>
  `;
}

function renderSpread(page: BookPage, project: Project) {
  const photos = findPagePhotos(page, project);
  const layout = selectStoryLayout(page, photos, project).active;
  const aspectRatio = getCanvasAspectRatio(mapBookFormatToLayoutFormat(project.bookDraft.format));

  return `
    <section class="spread-shell">
      <div class="spread-header">
        <div>
          <div class="spread-kicker">${escapeHtml(getStoryLayoutLabel(layout.layoutType))}</div>
          <div class="spread-title">${escapeHtml(page.title)}</div>
        </div>
        <div class="spread-status">${escapeHtml(page.storyBeat.replaceAll("_", " "))}</div>
      </div>
      <div class="story-canvas" style="aspect-ratio:${aspectRatio};background:${layout.style.backgroundColor};padding:${layout.style.padding}px;">
        ${layout.elements.map(renderCanvasElement).join("")}
      </div>
      <div class="spread-footer">
        <div class="spread-caption">${escapeHtml(page.caption)}</div>
        <div class="spread-note">${escapeHtml(page.curationNote ?? page.layoutNote)}</div>
      </div>
    </section>
  `;
}

export function buildProofHtml(project: Project) {
  const theme = getProofTheme(project);
  const coverPhoto =
    project.photos.find((photo) => photo.mustInclude && photo.imageUri) ??
    project.photos.find((photo) => photo.imageUri) ??
    project.photos[0];

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          :root {
            --accent: ${theme.accent};
            --muted: ${theme.muted};
            --paper: ${theme.paper};
            --surface: ${theme.surface};
            --ink: #1f1814;
            --line: rgba(31,24,20,0.1);
            --serif: ${theme.serif};
            --sans: ${theme.sans};
          }
          * { box-sizing: border-box; }
          html, body {
            margin: 0;
            padding: 0;
            background: var(--paper);
            color: var(--ink);
            font-family: var(--sans);
          }
          body { padding: 22px; }
          .cover,
          .spread-shell {
            page-break-after: always;
            border-radius: 28px;
            overflow: hidden;
            border: 1px solid var(--line);
            background: var(--surface);
            min-height: 94vh;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.72);
          }
          .cover {
            display: grid;
            grid-template-columns: 1.15fr 0.85fr;
          }
          .cover-media {
            background: ${theme.coverWash};
            min-height: 94vh;
          }
          .cover-media img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }
          .cover-copy {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding: 54px 44px;
            gap: 24px;
          }
          .cover-kicker,
          .spread-kicker {
            font-size: 11px;
            letter-spacing: 0.22em;
            text-transform: uppercase;
            color: var(--accent);
            font-weight: 700;
          }
          h1, h2, .spread-title {
            margin: 0;
            color: var(--ink);
            font-family: var(--serif);
            font-weight: 600;
          }
          h1 {
            font-size: 42px;
            line-height: 1.02;
          }
          h2 {
            font-size: 16px;
            line-height: 1.1;
          }
          .cover-summary,
          .cover-meta,
          .spread-caption,
          .spread-note,
          .story-text p {
            font-size: 13px;
            line-height: 1.7;
          }
          .cover-meta {
            display: flex;
            flex-direction: column;
            gap: 8px;
            color: var(--muted);
            text-transform: uppercase;
            letter-spacing: 0.14em;
            border-top: 1px solid var(--line);
            padding-top: 18px;
          }
          .spread-shell {
            padding: 28px;
            display: flex;
            flex-direction: column;
            gap: 18px;
          }
          .spread-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
          }
          .spread-title {
            font-size: 28px;
            line-height: 1.05;
            margin-top: 6px;
          }
          .spread-status {
            color: var(--muted);
            text-transform: capitalize;
            font-size: 12px;
            letter-spacing: 0.12em;
          }
          .story-canvas {
            position: relative;
            width: 100%;
            overflow: hidden;
            border-radius: 24px;
            border: 1px solid rgba(31,24,20,0.06);
          }
          .story-image,
          .story-text {
            position: absolute;
            overflow: hidden;
            border-radius: 18px;
          }
          .story-image {
            background: #e7ddd2;
            border: 1px solid rgba(255,255,255,0.42);
          }
          .story-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }
          .story-placeholder {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 14px;
            text-align: center;
            color: var(--muted);
            background: #eadfd4;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            font-weight: 700;
          }
          .story-text {
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            justify-content: space-between;
            border: 1px solid rgba(31,24,20,0.08);
          }
          .story-text.card {
            background: rgba(255,255,255,0.94);
          }
          .story-text.overlay {
            background: rgba(18,14,10,0.46);
            border-color: rgba(255,255,255,0.16);
          }
          .story-text.strip {
            background: rgba(255,255,255,0.9);
          }
          .story-eyebrow {
            font-size: 10px;
            letter-spacing: 0.2em;
            text-transform: uppercase;
            font-weight: 700;
            color: var(--muted);
          }
          .story-text.overlay .story-eyebrow,
          .story-text.overlay h2,
          .story-text.overlay p {
            color: #fff7ef;
          }
          .spread-footer {
            display: grid;
            grid-template-columns: 1.2fr 0.8fr;
            gap: 18px;
            align-items: start;
          }
          .spread-caption {
            color: #4f443d;
          }
          .spread-note {
            color: var(--muted);
          }
        </style>
      </head>
      <body>
        <section class="cover">
          <div class="cover-media">
            ${
              coverPhoto?.imageUri
                ? `<img src="${escapeAttribute(coverPhoto.imageUri)}" alt="${escapeAttribute(coverPhoto.title)}" />`
                : ""
            }
          </div>
          <div class="cover-copy">
            <div>
              <div class="cover-kicker">${escapeHtml(project.type === "yearbook" ? "Year recap" : "Trip story")}</div>
              <h1>${escapeHtml(project.title)}</h1>
              <p class="cover-summary">${escapeHtml(project.subtitle)}</p>
            </div>
            <div class="cover-meta">
              <span>${escapeHtml(formatProjectMeta(project))}</span>
              <span>${escapeHtml(project.bookDraft.summary)}</span>
            </div>
          </div>
        </section>
        ${project.bookDraft.pages.map((page) => renderSpread(page, project)).join("")}
      </body>
    </html>
  `;
}
