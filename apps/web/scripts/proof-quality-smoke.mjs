/* global AbortSignal, console, fetch, process */

import { access, copyFile, cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  createNextDevServerController,
  waitForHttpOk,
} from "./lib/next-dev-server.mjs";
const port = process.env.PROOF_QUALITY_PORT ?? "3222";
const explicitBaseUrl = process.env.PROOF_QUALITY_BASE_URL;
const defaultBaseUrl = `http://127.0.0.1:${port}`;
const allowExistingServer =
  Boolean(explicitBaseUrl) || process.env.PROOF_QUALITY_REUSE_EXISTING === "1";
const existingBaseUrl = await detectExistingBaseUrl();

if (existingBaseUrl && !allowExistingServer) {
  console.error(
    [
      `A Photo Book Maker dev server is already running at ${existingBaseUrl}.`,
      "The proof-quality smoke boots an isolated temp project store by default, but Next cannot run two dev servers for the same app directory.",
      "Stop the existing dev server and rerun, or set PROOF_QUALITY_REUSE_EXISTING=1 when you intentionally want to target the running app store.",
    ].join(" "),
  );
  process.exit(1);
}

const detectedExistingBaseUrl = allowExistingServer ? existingBaseUrl : undefined;
const baseUrl = (explicitBaseUrl ?? detectedExistingBaseUrl ?? defaultBaseUrl).replace(/\/$/, "");
const reuseExistingServer = Boolean(explicitBaseUrl || detectedExistingBaseUrl);
const isolated = !reuseExistingServer;
const fileStoreDir = isolated
  ? await mkdtemp(join(tmpdir(), "photo-book-maker-proof-quality-"))
  : undefined;
const sourceDataDir = process.env.PROOF_QUALITY_SOURCE_DATA_DIR
  ? resolve(process.env.PROOF_QUALITY_SOURCE_DATA_DIR)
  : join(process.cwd(), "data");
const projectId = process.env.PROOF_QUALITY_PROJECT_ID;
const projectTitleNeedle = (
  process.env.PROOF_QUALITY_PROJECT_TITLE ?? "Cap Cana 2026 Trip"
).toLowerCase();
const strict = process.env.PROOF_QUALITY_STRICT !== "0";
const fetchImages = process.env.PROOF_QUALITY_FETCH_IMAGES !== "0";
const maxImageChecks = Number.parseInt(process.env.PROOF_QUALITY_MAX_IMAGE_CHECKS ?? "18", 10);
const minQualityScore = Number.parseInt(process.env.PROOF_QUALITY_MIN_SCORE ?? "75", 10);
const reportPath = process.env.PROOF_QUALITY_REPORT_PATH;
const devAuthHeaders = process.env.PROOF_QUALITY_BEARER_TOKEN
  ? {
      "Authorization": `Bearer ${process.env.PROOF_QUALITY_BEARER_TOKEN}`,
    }
  : {
      "X-Photo-Book-Dev-Email":
        process.env.PROOF_QUALITY_DEV_EMAIL ?? "android-tester@example.com",
      "X-Photo-Book-Dev-Id": process.env.PROOF_QUALITY_DEV_ID ?? "android-tester",
      "X-Photo-Book-Dev-Name": process.env.PROOF_QUALITY_DEV_NAME ?? "Android Tester",
    };
const genericContextWords = new Set([
  "album",
  "and",
  "book",
  "draft",
  "family",
  "for",
  "from",
  "full",
  "clean",
  "generation",
  "image",
  "images",
  "into",
  "item",
  "items",
  "island",
  "local",
  "manual",
  "memory",
  "memories",
  "photo",
  "photos",
  "project",
  "set",
  "stock",
  "test",
  "testing",
  "the",
  "travel",
  "trip",
  "upload",
  "vacation",
  "with",
]);

let server;

async function detectExistingBaseUrl() {
  if (explicitBaseUrl) {
    return undefined;
  }

  const probeUrls = [
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3210",
    "http://127.0.0.1:3221",
    defaultBaseUrl,
  ];

  for (const probeUrl of [...new Set(probeUrls)]) {
    try {
      const response = await fetch(probeUrl, {
        signal: AbortSignal.timeout(1_500),
      });
      const text = await response.text();

      if (response.ok && text.includes("Photo Book Maker")) {
        return probeUrl;
      }
    } catch {
      // Keep probing known local dev ports.
    }
  }

  return undefined;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function prepareIsolatedStore() {
  if (!fileStoreDir) {
    return;
  }

  const sourceProjects = join(sourceDataDir, "projects.json");
  if (!(await pathExists(sourceProjects))) {
    throw new Error(`Proof-quality source project store was not found: ${sourceProjects}`);
  }

  await mkdir(fileStoreDir, { recursive: true });
  await copyFile(sourceProjects, join(fileStoreDir, "projects.json"));

  const sourceUploads = join(sourceDataDir, "local-uploads");
  if (await pathExists(sourceUploads)) {
    await cp(sourceUploads, join(fileStoreDir, "local-uploads"), {
      force: true,
      recursive: true,
    });
  }
}

function startServer() {
  if (!isolated) {
    return undefined;
  }

  return createNextDevServerController({
    baseUrl,
    cwd: process.cwd(),
    env: {
      ...process.env,
      EXPO_PUBLIC_API_BASE_URL: `${baseUrl}/api`,
      NEXT_PUBLIC_API_BASE_URL: `${baseUrl}/api`,
      NEXT_TELEMETRY_DISABLED: "1",
      PHOTO_BOOK_FILE_STORE_DIR: fileStoreDir,
    },
    label: "Proof-quality server",
    port,
  });
}

async function stopServer() {
  if (!server) {
    return;
  }

  await server.stop();
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 8_000) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function waitForServer() {
  if (server) {
    await server.start();
    return;
  }

  await waitForHttpOk(baseUrl, {
    label: "existing proof-quality server",
  });
}

async function apiJson(path, init = {}) {
  const response = await fetchWithTimeout(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...devAuthHeaders,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`API call failed ${path}: ${response.status}\n${text.slice(0, 1000)}`);
  }

  return body;
}

async function writeReport(summary) {
  if (!reportPath) {
    return;
  }

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

function tokenizeContextText(value) {
  return (value.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (token) =>
      token.length >= 3 &&
      !/^\d+$/.test(token) &&
      !genericContextWords.has(token),
  );
}

function getContextTerms(project) {
  const explicitTerms = (process.env.PROOF_QUALITY_CONTEXT_TERMS ?? "")
    .split(",")
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);
  if (explicitTerms.length) {
    return explicitTerms;
  }

  const tokens = tokenizeContextText(`${project.title ?? ""} ${project.subtitle ?? ""}`);
  const terms = new Set();
  if (tokens.length >= 2) {
    terms.add(tokens.slice(0, 2).join(" "));
  }
  for (const token of tokens.slice(0, 4)) {
    terms.add(token);
  }

  return [...terms];
}

function mentionsContext(copy, terms) {
  if (!terms.length) {
    return true;
  }

  const normalizedCopy = copy.toLowerCase();
  return terms.some((term) => normalizedCopy.includes(term));
}

function getLatestSavedRun(project) {
  return [...(project.generationRuns ?? [])]
    .filter((run) => run.status === "saved")
    .sort((left, right) =>
      String(right.completedAt ?? right.startedAt ?? "").localeCompare(
        String(left.completedAt ?? left.startedAt ?? ""),
      ),
    )[0];
}

function chooseProject(projects) {
  if (projectId) {
    const match = projects.find((project) => project.id === projectId);
    if (!match) {
      throw new Error(`Could not find project ${projectId}.`);
    }

    return match;
  }

  const titleMatch = projects.find((project) =>
    `${project.title ?? ""} ${project.subtitle ?? ""}`.toLowerCase().includes(projectTitleNeedle),
  );
  if (titleMatch) {
    return titleMatch;
  }

  const generatedCandidates = projects
    .filter((project) => getLatestSavedRun(project) && (project.photos?.length ?? 0) >= 6)
    .sort((left, right) => {
      const leftRun = getLatestSavedRun(left);
      const rightRun = getLatestSavedRun(right);
      return (
        (rightRun?.qualityReport?.score ?? 0) - (leftRun?.qualityReport?.score ?? 0) ||
        (right.photos?.length ?? 0) - (left.photos?.length ?? 0) ||
        (right.bookDraft?.pages?.length ?? 0) - (left.bookDraft?.pages?.length ?? 0)
      );
    });

  if (generatedCandidates[0]) {
    return generatedCandidates[0];
  }

  throw new Error(
    `Could not find a proof-quality target. Set PROOF_QUALITY_PROJECT_ID or PROOF_QUALITY_PROJECT_TITLE.`,
  );
}

function getApprovedPhotos(project) {
  return (project.photos ?? []).filter((photo) => photo.approved);
}

function getUsedPhotoIds(project) {
  const approvedIds = new Set(getApprovedPhotos(project).map((photo) => photo.id));
  return (project.bookDraft?.pages ?? []).flatMap((page) =>
    (page.photoIds ?? []).filter((photoId) => approvedIds.has(photoId)),
  );
}

function countBy(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
}

function extractProofSections(html) {
  return [...html.matchAll(/<section class="sheet story-sheet ([^"]+)"/g)].map((match) => {
    const classes = match[1] ?? "";
    return {
      classes,
      copyPosition: classes.match(/\bcopy-([a-z-]+)/)?.[1] ?? "unknown",
      layout: classes.match(/\blayout-([a-z-]+)/)?.[1] ?? "unknown",
      photoCount: Number.parseInt(classes.match(/\bphoto-count-(\d+)/)?.[1] ?? "0", 10),
      variation: classes.match(/\bvariation-(\d+)/)?.[1] ?? "unknown",
    };
  });
}

function extractImageSources(html) {
  return [...html.matchAll(/<img src="([^"]+)"/g)].map((match) =>
    (match[1] ?? "").replaceAll("&amp;", "&"),
  );
}

function toAbsoluteImageUrl(src) {
  if (/^https?:\/\//i.test(src)) {
    return src;
  }

  if (src.startsWith("/")) {
    return `${baseUrl}${src}`;
  }

  return null;
}

async function checkRenderedImages(sources) {
  if (!fetchImages) {
    return {
      checked: 0,
      failures: [],
      skipped: sources.length,
    };
  }

  const uniqueSources = [...new Set(sources)]
    .map(toAbsoluteImageUrl)
    .filter(Boolean)
    .slice(0, maxImageChecks);
  const failures = [];

  for (const src of uniqueSources) {
    try {
      const response = await fetchWithTimeout(src, {}, 8_000);
      if (!response.ok) {
        failures.push(`${response.status} ${src}`);
      }
    } catch (error) {
      failures.push(`${error instanceof Error ? error.message : "image fetch failed"} ${src}`);
    }
  }

  return {
    checked: uniqueSources.length,
    failures,
    skipped: Math.max(0, sources.length - uniqueSources.length),
  };
}

function assessProof(project, templateIds, proofHtml) {
  const approvedPhotos = getApprovedPhotos(project);
  const usedPhotoIds = getUsedPhotoIds(project);
  const uniqueUsedPhotoIds = new Set(usedPhotoIds);
  const duplicateUsedPhotoIds = [...new Set(
    usedPhotoIds.filter((photoId, index) => usedPhotoIds.indexOf(photoId) !== index),
  )];
  const pages = project.bookDraft?.pages ?? [];
  const unsupportedTemplateIds = [...new Set(
    pages
      .map((page) => page.templateId)
      .filter((templateId) => templateId && !templateIds.has(templateId)),
  )];
  const overfilledPages = pages
    .filter((page) => (page.photoIds?.length ?? 0) > 4)
    .map((page) => page.id);
  const emptyPages = pages
    .filter((page) => (page.photoIds?.length ?? 0) === 0)
    .map((page) => page.id);
  const missingPhotoReferences = pages.flatMap((page) =>
    (page.photoIds ?? [])
      .filter((photoId) => !project.photos?.some((photo) => photo.id === photoId))
      .map((photoId) => `${page.id}:${photoId}`),
  );
  const storySections = extractProofSections(proofHtml);
  const imageSources = extractImageSources(proofHtml);
  const renderedPhotoIds = [...new Set(
    [...proofHtml.matchAll(/data-photo-id="([^"]+)"/g)].map((match) => match[1] ?? ""),
  )];
  const captionPositions = storySections.map((section) => section.copyPosition);
  const positionCounts = countBy(captionPositions);
  const dominantPositionCount = Math.max(0, ...positionCounts.values());
  const layoutCount = new Set(storySections.map((section) => section.layout)).size;
  const copy = `${project.bookDraft?.summary ?? ""} ${pages
    .map((page) => `${page.title ?? ""} ${page.caption ?? ""}`)
    .join(" ")}`;
  const contextTerms = getContextTerms(project);
  const usagePercent = approvedPhotos.length ? uniqueUsedPhotoIds.size / approvedPhotos.length : 0;
  const latestSavedRun = getLatestSavedRun(project);
  const failures = [];
  const warnings = [];

  if (!pages.length) {
    failures.push("No draft pages are available for proof review.");
  }
  if (storySections.length < pages.length) {
    failures.push(`Proof rendered ${storySections.length} story sheets for ${pages.length} draft pages.`);
  }
  if (imageSources.length < uniqueUsedPhotoIds.size) {
    failures.push(`Proof rendered ${imageSources.length} images for ${uniqueUsedPhotoIds.size} unique used photos.`);
  }
  if (proofHtml.includes("Photo still syncing")) {
    failures.push("Proof contains a photo syncing placeholder.");
  }
  if (!proofHtml.includes("Safe text area")) {
    failures.push("Proof is missing print-safe guide text.");
  }
  if (!proofHtml.includes("box-shadow") || !proofHtml.includes(".photo-count-2 .story-media .photo-frame")) {
    failures.push("Proof CSS is missing the floating multi-photo border/shadow treatment.");
  }
  if (duplicateUsedPhotoIds.length) {
    failures.push(`Draft reused photo IDs: ${duplicateUsedPhotoIds.join(", ")}`);
  }
  if (unsupportedTemplateIds.length) {
    failures.push(`Draft uses unsupported template IDs: ${unsupportedTemplateIds.join(", ")}`);
  }
  if (overfilledPages.length) {
    failures.push(`Draft has pages with more photos than the proof can render: ${overfilledPages.join(", ")}`);
  }
  if (emptyPages.length) {
    failures.push(`Draft has empty photo pages: ${emptyPages.join(", ")}`);
  }
  if (missingPhotoReferences.length) {
    failures.push(`Draft references missing photos: ${missingPhotoReferences.join(", ")}`);
  }
  if (approvedPhotos.length <= 25 && usagePercent < 0.85) {
    failures.push(`Small-batch proof uses ${Math.round(usagePercent * 100)}% of approved photos; expected at least 85%.`);
  }
  if (approvedPhotos.length > 25 && usagePercent < 0.35) {
    failures.push(`Large-batch proof uses ${Math.round(usagePercent * 100)}% of approved photos; expected at least 35%.`);
  }
  if (approvedPhotos.length <= 25 && (pages.length < 6 || pages.length > 10)) {
    failures.push(`Small-batch proof has ${pages.length} pages; expected 6-10 well-filled spreads.`);
  }
  if (approvedPhotos.length >= 26 && approvedPhotos.length <= 60 && (pages.length < 10 || pages.length > 14)) {
    failures.push(`60-photo proof has ${pages.length} pages; expected 10-14 curated spreads.`);
  }
  if (pages.length >= 6 && new Set(captionPositions).size < 3) {
    failures.push("Caption placement is too repetitive; expected at least three proof positions.");
  }
  if (pages.length >= 6 && dominantPositionCount > Math.ceil(storySections.length * 0.6)) {
    failures.push("One caption position dominates too much of the proof.");
  }
  if (layoutCount < Math.min(3, pages.length)) {
    failures.push("Proof layout rhythm is too repetitive.");
  }
  if (/caption text|placeholder|lorem ipsum|spread title|photo-id/i.test(copy)) {
    failures.push("Draft copy contains placeholder language.");
  }
  if (!mentionsContext(copy, contextTerms)) {
    failures.push(`Draft copy does not mention expected trip context (${contextTerms.join(", ")}).`);
  }
  if (latestSavedRun?.qualityReport && latestSavedRun.qualityReport.score < minQualityScore) {
    failures.push(
      `Latest saved generation score ${latestSavedRun.qualityReport.score}/100 is below ${minQualityScore}/100.`,
    );
  }
  if (!latestSavedRun?.qualityReport) {
    warnings.push("No latest saved AI generation quality report was available for this project.");
  }

  return {
    approvedPhotoCount: approvedPhotos.length,
    captionPositionCounts: Object.fromEntries(positionCounts),
    contextTerms,
    duplicateUsedPhotoIds,
    failures,
    imageCount: imageSources.length,
    layoutCount,
    latestSavedQualityScore: latestSavedRun?.qualityReport?.score ?? null,
    pageCount: pages.length,
    renderedPhotoCount: renderedPhotoIds.length,
    storySheetCount: storySections.length,
    unsupportedTemplateIds,
    usedPhotoCount: uniqueUsedPhotoIds.size,
    usedPhotoPercent: usagePercent,
    warnings,
  };
}

try {
  await prepareIsolatedStore();
  server = startServer();
  await waitForServer();

  const templates = await apiJson("/api/templates");
  const templateIds = new Set(
    templates.catalog?.spreadTemplates?.map((template) => template.id) ?? [],
  );
  const projects = (await apiJson("/api/projects")).projects ?? [];
  const project = chooseProject(projects);
  const proof = await apiJson(`/api/projects/${project.id}/proof?bleed=1&safe=1`);
  const assessment = assessProof(project, templateIds, proof.html ?? "");
  const imageCheck = await checkRenderedImages(extractImageSources(proof.html ?? ""));
  assessment.failures.push(
    ...imageCheck.failures.map((failure) => `Proof image failed to load: ${failure}`),
  );

  const summary = {
    assessment,
    baseUrl,
    fetchImages,
    imageCheck,
    isolated,
    projectId: project.id,
    projectTitle: project.title,
    proofRevision: proof.revision,
    sourceDataDir: isolated ? sourceDataDir : null,
  };

  console.log(JSON.stringify(summary, null, 2));
  await writeReport(summary);

  if (strict && assessment.failures.length) {
    throw new Error(`Proof quality smoke failed:\n- ${assessment.failures.join("\n- ")}`);
  }

  console.log("proof quality smoke passed");
} finally {
  await stopServer();
  if (fileStoreDir) {
    await rm(fileStoreDir, { force: true, recursive: true });
  }
}
