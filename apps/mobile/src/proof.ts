import type { BookPage, PhotoAsset, Project } from "./core";

function renderPhoto(photo: PhotoAsset, className = "photo") {
  const title = escapeHtml(photo.title);
  const location = photo.locationLabel
    ? `<div class="photo-meta">${escapeHtml(photo.locationLabel)}</div>`
    : "";

  if (!photo.imageUri) {
    return `
      <figure class="${className} photo-frame placeholder">
        <div class="placeholder-copy">${title}</div>
        ${location}
      </figure>
    `;
  }

  return `
    <figure class="${className} photo-frame">
      <img src="${escapeAttribute(photo.imageUri)}" alt="${escapeAttribute(title)}" />
      <figcaption>
        <div class="photo-title">${title}</div>
        ${location}
      </figcaption>
    </figure>
  `;
}

function renderSpread(page: BookPage, index: number, project: Project) {
  const photos = page.photoIds
    .map((photoId) => project.photos.find((photo) => photo.id === photoId))
    .filter((photo): photo is PhotoAsset => Boolean(photo));
  const galleryClass = photos.length > 1 ? "photo-gallery split" : "photo-gallery";

  return `
    <section class="spread">
      <div class="spread-copy">
        <div class="eyebrow">Spread ${index + 1} - ${page.style.replaceAll("_", " ")}</div>
        <h2>${escapeHtml(page.title)}</h2>
        <p>${escapeHtml(page.caption)}</p>
      </div>
      <div class="${galleryClass}">
        ${photos.length ? photos.map((photo) => renderPhoto(photo)).join("") : `<div class="empty-gallery">No photos are attached to this spread yet.</div>`}
      </div>
      <div class="note">${escapeHtml(page.layoutNote)}</div>
    </section>
  `;
}

export function buildProofHtml(project: Project) {
  const coverPhoto =
    project.photos.find((photo) => photo.mustInclude && photo.imageUri) ??
    project.photos.find((photo) => photo.imageUri) ??
    project.photos[0];
  const pages = project.bookDraft.pages
    .map((page, index) => renderSpread(page, index, project))
    .join("");

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * {
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            margin: 0;
            padding: 30px;
            color: #201913;
            background: #f7f0e9;
          }
          .cover, .spread {
            page-break-after: always;
            background: rgba(255,255,255,0.9);
            border: 1px solid rgba(32, 25, 19, 0.12);
            border-radius: 28px;
            padding: 28px;
            min-height: 92vh;
          }
          .cover {
            display: flex;
            flex-direction: column;
            gap: 20px;
          }
          .cover-media {
            border-radius: 24px;
            overflow: hidden;
            min-height: 360px;
            background: #e8ddcf;
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
            gap: 12px;
          }
          .cover h1 {
            font-size: 34px;
            margin: 0;
          }
          .cover p, .spread p {
            font-size: 15px;
            line-height: 1.7;
            margin: 0;
          }
          .eyebrow {
            text-transform: uppercase;
            letter-spacing: 0.24em;
            color: #7d6f65;
            font-size: 11px;
            font-weight: 700;
          }
          h2 {
            font-size: 26px;
            margin: 12px 0 10px;
          }
          .spread {
            display: flex;
            flex-direction: column;
            gap: 18px;
          }
          .spread-copy {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .photo-gallery {
            display: grid;
            grid-template-columns: 1fr;
            gap: 16px;
          }
          .photo-gallery.split {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .photo-frame {
            margin: 0;
            border-radius: 22px;
            overflow: hidden;
            border: 1px solid rgba(32, 25, 19, 0.08);
            background: #fbf7f2;
          }
          .photo-frame img {
            width: 100%;
            height: 320px;
            object-fit: cover;
            display: block;
            background: #e8ddcf;
          }
          .photo-frame figcaption {
            padding: 12px 14px 14px;
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .photo-title {
            font-size: 14px;
            font-weight: 700;
            color: #201913;
          }
          .photo-meta {
            font-size: 12px;
            color: #5d524a;
          }
          .placeholder {
            min-height: 320px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
          }
          .placeholder-copy {
            font-size: 14px;
            font-weight: 700;
            text-align: center;
            color: #7d6f65;
          }
          .empty-gallery {
            border-radius: 22px;
            border: 1px dashed rgba(32, 25, 19, 0.16);
            padding: 20px;
            color: #7d6f65;
            background: rgba(247, 240, 233, 0.7);
          }
          .note {
            margin-top: auto;
            padding-top: 16px;
            border-top: 1px solid rgba(32, 25, 19, 0.12);
            color: #325949;
            font-weight: 600;
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
            <div class="eyebrow">${escapeHtml(project.type)} proof export</div>
            <h1>${escapeHtml(project.title)}</h1>
            <p>${escapeHtml(project.subtitle)}</p>
            <p>${escapeHtml(project.bookDraft.summary)}</p>
            <p><strong>Format:</strong> ${escapeHtml(project.bookDraft.format)}</p>
            <p><strong>Status:</strong> ${escapeHtml(project.status)}</p>
          </div>
        </section>
        ${pages}
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
