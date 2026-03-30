import type { BookPage, PhotoAsset, Project } from "./core";

type ProofTheme = {
  accent: string;
  accentSoft: string;
  coverWash: string;
  paper: string;
  serif: string;
  sans: string;
};

function getProofTheme(project: Project): ProofTheme {
  switch (project.selectedThemeId) {
    case "pine-ink":
      return {
        accent: "#335c52",
        accentSoft: "#dce7e2",
        coverWash: "linear-gradient(135deg, rgba(23,42,37,0.1), rgba(51,92,82,0.28))",
        paper: "#f2f0eb",
        serif: '"Palatino Linotype", "Book Antiqua", Palatino, serif',
        sans: '"Avenir Next", "Helvetica Neue", Arial, sans-serif',
      };
    case "coastline":
      return {
        accent: "#5e759f",
        accentSoft: "#e1e7f1",
        coverWash: "linear-gradient(135deg, rgba(38,55,86,0.08), rgba(106,126,168,0.24))",
        paper: "#f5f3f0",
        serif: 'Didot, "Bodoni 72", Georgia, serif',
        sans: '"Helvetica Neue", Arial, sans-serif',
      };
    default:
      return {
        accent: "#c76c3a",
        accentSoft: "#f2dfd1",
        coverWash: "linear-gradient(135deg, rgba(108,53,26,0.08), rgba(199,108,58,0.26))",
        paper: "#f6efe7",
        serif: 'Georgia, "Times New Roman", serif',
        sans: '"Avenir Next", "Helvetica Neue", Arial, sans-serif',
      };
  }
}

function formatPhotoDate(project: Project, capturedAt: string) {
  return new Date(capturedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: project.timezone,
  });
}

function renderPhotoMeta(project: Project, photo: PhotoAsset) {
  const parts = [
    photo.locationLabel?.trim(),
    formatPhotoDate(project, photo.capturedAt),
  ].filter((part): part is string => Boolean(part));

  if (!parts.length) {
    return "";
  }

  return `<div class="photo-meta">${escapeHtml(parts.join(" - "))}</div>`;
}

function renderPhoto(project: Project, photo: PhotoAsset, className = "photo-frame") {
  const title = escapeHtml(photo.title);
  const meta = renderPhotoMeta(project, photo);

  if (!photo.imageUri) {
    return `
      <figure class="${className} placeholder">
        <div class="placeholder-copy">${title}</div>
        ${meta}
      </figure>
    `;
  }

  return `
    <figure class="${className}">
      <img src="${escapeAttribute(photo.imageUri)}" alt="${escapeAttribute(title)}" />
      <figcaption>
        <div class="photo-title">${title}</div>
        ${meta}
      </figcaption>
    </figure>
  `;
}

function findPagePhotos(page: BookPage, project: Project) {
  return page.photoIds
    .map((photoId) => project.photos.find((photo) => photo.id === photoId))
    .filter((photo): photo is PhotoAsset => Boolean(photo));
}

function renderPageHeading(page: BookPage) {
  const storyBeat =
    page.storyBeat ??
    (page.style === "full_bleed" || page.style === "hero"
      ? "opener"
      : page.style === "recap" || page.style === "closing"
        ? "closing"
        : "details");

  return `
    <div class="copy-block">
      <div class="eyebrow">${escapeHtml(storyBeat.replaceAll("_", " "))}</div>
      <h2>${escapeHtml(page.title)}</h2>
      <p>${escapeHtml(page.caption)}</p>
    </div>
  `;
}

function renderHeroSpread(page: BookPage, project: Project) {
  const photos = findPagePhotos(page, project);
  const lead = photos[0];

  return `
    <section class="spread spread-hero">
      <div class="hero-media">
        ${lead ? renderPhoto(project, lead, "hero-photo") : `<div class="empty-state">Add a hero image to anchor this opening spread.</div>`}
      </div>
      <div class="hero-copy">
        ${renderPageHeading(page)}
      </div>
    </section>
  `;
}

function renderFullBleedSpread(page: BookPage, project: Project) {
  const photos = findPagePhotos(page, project);
  const lead = photos[0];

  return `
    <section class="spread spread-full-bleed">
      ${
        lead
          ? renderPhoto(project, lead, "full-bleed-photo")
          : `<div class="empty-state">A cinematic frame belongs here.</div>`
      }
      <div class="floating-copy">
        ${renderPageHeading(page)}
      </div>
    </section>
  `;
}

function renderBalancedSpread(page: BookPage, project: Project) {
  const photos = findPagePhotos(page, project);
  const primary = photos[0];
  const secondary = photos[1];

  return `
    <section class="spread spread-balanced">
      <div class="balanced-media">
        <div class="balanced-lead">
          ${primary ? renderPhoto(project, primary, "balanced-photo tall") : `<div class="empty-state">Lead image missing.</div>`}
        </div>
        <div class="balanced-side">
          ${renderPageHeading(page)}
          ${
            secondary
              ? renderPhoto(project, secondary, "balanced-photo side")
              : `<div class="balanced-note">${escapeHtml(page.curationNote ?? page.layoutNote)}</div>`
          }
        </div>
      </div>
    </section>
  `;
}

function renderDiptychSpread(page: BookPage, project: Project) {
  const photos = findPagePhotos(page, project);

  return `
    <section class="spread spread-diptych">
      <div class="diptych-grid">
        ${photos.map((photo) => renderPhoto(project, photo, "diptych-photo")).join("")}
      </div>
      <div class="diptych-copy">
        ${renderPageHeading(page)}
      </div>
    </section>
  `;
}

function renderMosaicSpread(page: BookPage, project: Project) {
  const photos = findPagePhotos(page, project);
  const [lead, ...supporting] = photos;

  return `
    <section class="spread spread-mosaic">
      <div class="mosaic-copy">${renderPageHeading(page)}</div>
      <div class="mosaic-grid">
        ${lead ? renderPhoto(project, lead, "mosaic-photo lead") : ""}
        ${supporting.map((photo) => renderPhoto(project, photo, "mosaic-photo")).join("")}
      </div>
    </section>
  `;
}

function renderChapterSpread(page: BookPage, project: Project) {
  const photos = findPagePhotos(page, project);
  const supporting = photos[0];

  return `
    <section class="spread spread-chapter">
        <div class="chapter-copy">
          ${renderPageHeading(page)}
          <div class="chapter-rule"></div>
          <div class="chapter-note">${escapeHtml(page.curationNote ?? page.layoutNote)}</div>
        </div>
      <div class="chapter-media">
        ${
          supporting
            ? renderPhoto(project, supporting, "chapter-photo")
            : `<div class="empty-state">Memory-note interlude</div>`
        }
      </div>
    </section>
  `;
}

function renderClosingSpread(page: BookPage, project: Project) {
  const photos = findPagePhotos(page, project);

  return `
    <section class="spread spread-closing">
      <div class="closing-copy">${renderPageHeading(page)}</div>
      <div class="closing-strip">
        ${photos.map((photo) => renderPhoto(project, photo, "closing-photo")).join("")}
      </div>
    </section>
  `;
}

function renderSpread(page: BookPage, project: Project) {
  switch (page.style) {
    case "hero":
      return renderHeroSpread(page, project);
    case "full_bleed":
      return renderFullBleedSpread(page, project);
    case "balanced":
      return renderBalancedSpread(page, project);
    case "diptych":
      return renderDiptychSpread(page, project);
    case "chapter":
      return renderChapterSpread(page, project);
    case "mosaic":
    case "collage":
      return renderMosaicSpread(page, project);
    case "closing":
    case "recap":
      return renderClosingSpread(page, project);
    default:
      return renderBalancedSpread(page, project);
  }
}

export function buildProofHtml(project: Project) {
  const theme = getProofTheme(project);
  const coverPhoto =
    project.photos.find((photo) => photo.mustInclude && photo.imageUri) ??
    project.photos.find((photo) => photo.imageUri) ??
    project.photos[0];
  const spreads = project.bookDraft.pages
    .map(
      (page, index) => `
        <div class="spread-shell">
          ${renderSpread(page, project)}
          <div class="page-number">${String(index + 1).padStart(2, "0")}</div>
        </div>
      `,
    )
    .join("");

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          :root {
            --accent: ${theme.accent};
            --accent-soft: ${theme.accentSoft};
            --paper: ${theme.paper};
            --ink: #1f1814;
            --muted: #6f625b;
            --line: rgba(31, 24, 20, 0.12);
            --surface: rgba(255, 252, 248, 0.92);
            --serif: ${theme.serif};
            --sans: ${theme.sans};
          }
          * {
            box-sizing: border-box;
          }
          html, body {
            margin: 0;
            padding: 0;
            background: var(--paper);
            color: var(--ink);
          }
          body {
            font-family: var(--sans);
            padding: 20px;
          }
          .cover,
          .spread-shell {
            position: relative;
            min-height: 92vh;
            page-break-after: always;
            background: var(--surface);
            border-radius: 30px;
            overflow: hidden;
            border: 1px solid var(--line);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.65);
          }
          .spread {
            min-height: 92vh;
          }
          .cover {
            display: grid;
            grid-template-columns: 1.2fr 0.8fr;
          }
          .cover-media {
            position: relative;
            min-height: 92vh;
            background: ${theme.coverWash};
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
            gap: 18px;
            padding: 56px 44px;
          }
          .cover-copy-top {
            display: flex;
            flex-direction: column;
            gap: 18px;
          }
          .cover-kicker {
            font-size: 11px;
            letter-spacing: 0.26em;
            text-transform: uppercase;
            color: var(--accent);
            font-weight: 700;
          }
          h1, h2 {
            font-family: var(--serif);
            font-weight: 600;
            margin: 0;
            color: var(--ink);
          }
          h1 {
            font-size: 42px;
            line-height: 1.02;
          }
          h2 {
            font-size: 29px;
            line-height: 1.05;
          }
          p {
            margin: 0;
            font-size: 14px;
            line-height: 1.78;
            color: #4f443d;
          }
          .cover-summary {
            max-width: 30ch;
          }
          .cover-meta {
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding-top: 16px;
            border-top: 1px solid var(--line);
            font-size: 12px;
            color: var(--muted);
            text-transform: uppercase;
            letter-spacing: 0.16em;
          }
          .eyebrow {
            font-size: 11px;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            color: var(--accent);
            font-weight: 700;
          }
          .copy-block {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }
          .copy-block p {
            max-width: 38ch;
          }
          .photo-frame,
          .hero-photo,
          .full-bleed-photo,
          .balanced-photo,
          .diptych-photo,
          .mosaic-photo,
          .chapter-photo,
          .closing-photo {
            margin: 0;
            border-radius: 22px;
            overflow: hidden;
            background: #e9dfd3;
            border: 1px solid rgba(31,24,20,0.06);
          }
          .photo-frame img,
          .hero-photo img,
          .full-bleed-photo img,
          .balanced-photo img,
          .diptych-photo img,
          .mosaic-photo img,
          .chapter-photo img,
          .closing-photo img {
            width: 100%;
            height: 100%;
            display: block;
            object-fit: cover;
            background: #e9dfd3;
          }
          figcaption {
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 12px 14px 14px;
            background: rgba(255,255,255,0.92);
          }
          .photo-title {
            font-size: 12px;
            line-height: 1.35;
            color: var(--ink);
            font-weight: 700;
          }
          .photo-meta {
            font-size: 11px;
            line-height: 1.45;
            color: var(--muted);
          }
          .placeholder {
            min-height: 260px;
            padding: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            color: var(--muted);
          }
          .spread {
            padding: 32px;
          }
          .spread-hero {
            display: grid;
            grid-template-columns: 1.2fr 0.8fr;
            gap: 24px;
            align-items: stretch;
          }
          .hero-media {
            min-height: 84vh;
          }
          .hero-photo,
          .hero-photo img {
            height: 100%;
          }
          .hero-copy {
            display: flex;
            align-items: flex-end;
            padding-bottom: 10px;
          }
          .spread-full-bleed {
            padding: 0;
          }
          .full-bleed-photo,
          .full-bleed-photo img {
            border-radius: 0;
            width: 100%;
            height: 92vh;
          }
          .floating-copy {
            position: absolute;
            left: 34px;
            bottom: 34px;
            max-width: 360px;
            padding: 24px;
            border-radius: 24px;
            background: rgba(255,250,246,0.9);
            backdrop-filter: blur(4px);
            border: 1px solid rgba(31,24,20,0.08);
          }
          .spread-balanced {
            display: grid;
            grid-template-columns: 1.1fr 0.9fr;
            gap: 22px;
          }
          .balanced-media {
            display: contents;
          }
          .balanced-lead {
            min-height: 84vh;
          }
          .balanced-photo.tall,
          .balanced-photo.tall img {
            height: 100%;
          }
          .balanced-side {
            display: flex;
            flex-direction: column;
            gap: 18px;
          }
          .balanced-photo.side img {
            height: 300px;
          }
          .balanced-note {
            padding: 18px;
            border-radius: 20px;
            background: var(--accent-soft);
            color: #4f443d;
            font-size: 13px;
            line-height: 1.7;
          }
          .spread-diptych {
            display: flex;
            flex-direction: column;
            gap: 22px;
          }
          .diptych-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 18px;
          }
          .diptych-photo img {
            height: 56vh;
          }
          .diptych-copy {
            padding-top: 6px;
            border-top: 1px solid var(--line);
          }
          .spread-mosaic {
            display: grid;
            grid-template-columns: 0.78fr 1.22fr;
            gap: 20px;
          }
          .mosaic-copy {
            display: flex;
            align-items: flex-start;
          }
          .mosaic-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            grid-auto-rows: minmax(180px, 1fr);
            gap: 16px;
          }
          .mosaic-photo.lead {
            grid-column: 1 / -1;
          }
          .mosaic-photo.lead img {
            height: 340px;
          }
          .mosaic-photo img {
            height: 240px;
          }
          .spread-chapter {
            display: grid;
            grid-template-columns: 1fr 0.8fr;
            gap: 26px;
            align-items: center;
          }
          .chapter-copy {
            display: flex;
            flex-direction: column;
            gap: 18px;
            padding-right: 16px;
          }
          .chapter-rule {
            width: 72px;
            height: 3px;
            border-radius: 999px;
            background: var(--accent);
          }
          .chapter-note {
            font-size: 13px;
            line-height: 1.75;
            color: var(--muted);
          }
          .chapter-photo img {
            height: 50vh;
          }
          .spread-closing {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            gap: 28px;
          }
          .closing-copy {
            max-width: 42ch;
          }
          .closing-strip {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 16px;
            align-items: end;
          }
          .closing-photo img {
            height: 260px;
          }
          .empty-state {
            min-height: 260px;
            border: 1px dashed var(--line);
            border-radius: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            color: var(--muted);
            background: rgba(255,255,255,0.7);
            text-align: center;
          }
          .page-number {
            position: absolute;
            right: 28px;
            bottom: 20px;
            font-size: 11px;
            letter-spacing: 0.18em;
            text-transform: uppercase;
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
            <div class="cover-copy-top">
              <div class="cover-kicker">${escapeHtml(project.type === "yearbook" ? "Annual album proof" : "Trip book proof")}</div>
              <h1>${escapeHtml(project.title)}</h1>
              <p>${escapeHtml(project.subtitle)}</p>
              <p class="cover-summary">${escapeHtml(project.bookDraft.summary)}</p>
            </div>
            <div class="cover-meta">
              <div>${escapeHtml(project.bookDraft.format)}</div>
              <div>${escapeHtml(project.bookThemes.find((themeEntry) => themeEntry.id === project.selectedThemeId)?.name ?? "Editorial theme")}</div>
              <div>${escapeHtml(project.status.replaceAll("_", " "))}</div>
            </div>
          </div>
        </section>
        ${spreads}
      </body>
    </html>
  `;
}

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
