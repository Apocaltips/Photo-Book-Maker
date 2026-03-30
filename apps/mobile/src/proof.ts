import type { Project } from "./core";

export function buildProofHtml(project: Project) {
  const pages = project.bookDraft.pages
    .map(
      (page, index) => `
        <section class="spread">
          <div class="eyebrow">Spread ${index + 1} - ${page.style.replaceAll("_", " ")}</div>
          <h2>${escapeHtml(page.title)}</h2>
          <p>${escapeHtml(page.caption)}</p>
          <div class="note">${escapeHtml(page.layoutNote)}</div>
        </section>
      `,
    )
    .join("");

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            margin: 0;
            padding: 40px;
            color: #201913;
            background: #f7f0e9;
          }
          .cover, .spread {
            page-break-after: always;
            background: rgba(255,255,255,0.88);
            border: 1px solid rgba(32, 25, 19, 0.12);
            border-radius: 28px;
            padding: 32px;
            min-height: 80vh;
          }
          .cover h1 {
            font-size: 34px;
            margin: 16px 0 8px;
          }
          .cover p, .spread p {
            font-size: 15px;
            line-height: 1.7;
          }
          .eyebrow {
            text-transform: uppercase;
            letter-spacing: 0.24em;
            color: #7d6f65;
            font-size: 11px;
          }
          h2 {
            font-size: 26px;
            margin: 18px 0 10px;
          }
          .note {
            margin-top: 18px;
            padding-top: 16px;
            border-top: 1px solid rgba(32, 25, 19, 0.12);
            color: #325949;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <section class="cover">
          <div class="eyebrow">${project.type} proof export</div>
          <h1>${escapeHtml(project.title)}</h1>
          <p>${escapeHtml(project.subtitle)}</p>
          <p>${escapeHtml(project.bookDraft.summary)}</p>
          <p><strong>Format:</strong> ${escapeHtml(project.bookDraft.format)}</p>
          <p><strong>Status:</strong> ${escapeHtml(project.status)}</p>
        </section>
        ${pages}
      </body>
    </html>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
