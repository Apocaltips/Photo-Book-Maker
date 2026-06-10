/* global console, process */

import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import { dirname } from "node:path";
import { URL } from "node:url";

const baseUrl = (process.env.AI_GENERATION_BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const projectId = process.env.AI_GENERATION_PROJECT_ID;
const projectTitleNeedle = (
  process.env.AI_GENERATION_PROJECT_TITLE ?? "Cap Cana 2026 Trip"
).toLowerCase();
const timeoutMs = Number.parseInt(process.env.AI_GENERATION_TIMEOUT_MS ?? "600000", 10);
const strictAcceptance = process.env.AI_GENERATION_STRICT !== "0";
const disallowDeterministicFallback =
  process.env.AI_GENERATION_DISALLOW_DETERMINISTIC_FALLBACK === "1";
const reportPath = process.env.AI_GENERATION_REPORT_PATH;
const allowExistingStore = process.env.AI_GENERATION_ALLOW_EXISTING_STORE === "1";
const devAuthHeaders = {
  "X-Photo-Book-Dev-Email":
    process.env.AI_GENERATION_DEV_EMAIL ?? "android-tester@example.com",
  "X-Photo-Book-Dev-Id": process.env.AI_GENERATION_DEV_ID ?? "android-tester",
  "X-Photo-Book-Dev-Name": process.env.AI_GENERATION_DEV_NAME ?? "Android Tester",
};

async function apiJson(path, init = {}) {
  const url = new URL(`${baseUrl}${path}`);
  const bodyText = init.body ?? "";
  const headers = {
    ...devAuthHeaders,
    "Content-Type": "application/json",
    ...(init.headers ?? {}),
  };
  if (bodyText) {
    headers["Content-Length"] = Buffer.byteLength(bodyText);
  }

  const { body, statusCode } = await new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? requestHttps : requestHttp)(
      url,
      {
        headers,
        method: init.method ?? "GET",
        timeout: timeoutMs,
      },
      (response) => {
        let responseText = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseText += chunk;
        });
        response.on("end", () => {
          resolve({ body: responseText ? JSON.parse(responseText) : {}, statusCode: response.statusCode ?? 0 });
        });
      },
    );

    request.on("error", reject);
    request.on("timeout", () => {
      request.destroy(new Error(`API call timed out after ${timeoutMs}ms: ${path}`));
    });
    if (bodyText) {
      request.write(bodyText);
    }
    request.end();
  });

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`API call failed ${path}: ${statusCode}\n${JSON.stringify(body).slice(0, 1000)}`);
  }

  return body;
}

function getApprovedPhotos(project) {
  return (project.photos ?? []).filter((photo) => photo.approved);
}

function getDuplicatePhotoKeys(project) {
  const seen = new Map();
  const duplicates = [];

  for (const photo of getApprovedPhotos(project)) {
    const key = [
      photo.storagePath ?? photo.imageUri ?? photo.uri ?? photo.id,
      photo.width ?? "",
      photo.height ?? "",
      photo.capturedAt ?? "",
    ].join("|");
    const previous = seen.get(key);
    if (previous) {
      duplicates.push([previous.id, photo.id]);
    } else {
      seen.set(key, photo);
    }
  }

  return duplicates;
}

function getUsedPhotoIds(project) {
  return new Set(
    (project.bookDraft?.pages ?? []).flatMap((page) =>
      (page.photoIds ?? []).filter((photoId) =>
        project.photos?.some((photo) => photo.id === photoId && photo.approved),
      ),
    ),
  );
}

function assertAcceptance(project, templateIds) {
  const approvedPhotos = getApprovedPhotos(project);
  const usedPhotoIds = getUsedPhotoIds(project);
  const pages = project.bookDraft?.pages ?? [];
  const captions = pages.map((page) => `${page.title ?? ""} ${page.caption ?? ""}`).join(" ");
  const unsupportedTemplates = pages
    .map((page) => page.templateId)
    .filter((templateId) => templateId && !templateIds.has(templateId));
  const duplicatePairs = getDuplicatePhotoKeys(project);
  const usagePercent = approvedPhotos.length ? usedPhotoIds.size / approvedPhotos.length : 0;
  const hasHero = pages.some((page) =>
    /opener|highlight/.test(page.storyBeat ?? "") ||
    /hero|full-bleed|cinematic/.test(page.templateId ?? ""),
  );
  const hasDetailGrid = pages.some((page) =>
    /detail|grid|mosaic|contact-sheet/.test(`${page.storyBeat ?? ""} ${page.templateId ?? ""}`),
  );
  const hasQuietCaption = pages.some((page) =>
    /reflection|closing|quiet|caption/.test(`${page.storyBeat ?? ""} ${page.templateId ?? ""}`),
  );
  const hasTripContext = /cap cana|dominican republic|dominican/i.test(
    `${project.title} ${project.subtitle} ${project.bookDraft?.summary ?? ""} ${captions}`,
  );
  const hasPlaceholderCopy = /caption text|placeholder|lorem ipsum|spread title|photo-id/i.test(
    captions,
  );
  const failures = [];

  if (duplicatePairs.length) {
    failures.push(`${duplicatePairs.length} duplicate approved photo key(s) found`);
  }
  if (approvedPhotos.length <= 25 && usagePercent < 0.85) {
    failures.push(
      `approved photo usage ${Math.round(usagePercent * 100)}% is below the 85% small-batch target`,
    );
  }
  if (approvedPhotos.length > 25 && usagePercent < 0.35) {
    failures.push(
      `approved photo usage ${Math.round(usagePercent * 100)}% is below the 35% large-batch curation target`,
    );
  }
  if (approvedPhotos.length <= 25 && (pages.length < 6 || pages.length > 8)) {
    failures.push(`spread count ${pages.length} is outside the 6-8 small-batch target`);
  }
  if (
    approvedPhotos.length >= 26 &&
    approvedPhotos.length <= 60 &&
    (pages.length < 10 || pages.length > 14)
  ) {
    failures.push(`spread count ${pages.length} is outside the 10-14 large-batch target`);
  }
  if (unsupportedTemplates.length) {
    failures.push(`unsupported template id(s): ${unsupportedTemplates.join(", ")}`);
  }
  if (!hasHero) {
    failures.push("no hero/opener spread detected");
  }
  if (!hasDetailGrid) {
    failures.push("no detail/grid spread detected");
  }
  if (!hasQuietCaption) {
    failures.push("no quiet caption/reflection spread detected");
  }
  if (!hasTripContext) {
    failures.push("captions/summary do not mention Cap Cana or Dominican context");
  }
  if (hasPlaceholderCopy) {
    failures.push("placeholder copy detected in generated captions");
  }

  return {
    duplicatePairs,
    failures,
    hasDetailGrid,
    hasHero,
    hasQuietCaption,
    hasTripContext,
    pageCount: pages.length,
    unsupportedTemplates,
    usagePercent,
    usedPhotoCount: usedPhotoIds.size,
  };
}

function getPlannerMode(run) {
  const planner = run?.modelNames?.planner;
  if (!planner) {
    return "none";
  }

  if (planner === "deterministic-editorial-fallback") {
    return "deterministic-fallback";
  }

  if (planner === run?.modelNames?.fallbackPlanner) {
    return "fallback-planner";
  }

  return "primary-or-custom-planner";
}

async function writeReport(summary) {
  if (!reportPath) {
    return;
  }

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`);
}

async function findProject() {
  if (projectId) {
    return (await apiJson(`/api/projects/${projectId}`)).project;
  }

  const projects = (await apiJson("/api/projects")).projects ?? [];
  const match = projects.find((project) =>
    `${project.title} ${project.subtitle}`.toLowerCase().includes(projectTitleNeedle),
  );

  if (!match) {
    throw new Error(
      `Could not find a project matching "${projectTitleNeedle}". Set AI_GENERATION_PROJECT_ID to run a specific project.`,
    );
  }

  return match;
}

function assertExistingStoreOptIn() {
  const isDefaultLocalApp = /^https?:\/\/(?:127\.0\.0\.1|localhost):3000\b/i.test(baseUrl);
  if (!isDefaultLocalApp || allowExistingStore) {
    return;
  }

  throw new Error(
    [
      "Refusing to mutate the default local project store without explicit opt-in.",
      "Set AI_GENERATION_ALLOW_EXISTING_STORE=1 when you intentionally want this smoke to save a generation run into the current local app data.",
      "For safer automated E2E coverage, use npm run test:e2e:web, which boots an isolated temp store by default.",
    ].join(" "),
  );
}

const startedAt = Date.now();
assertExistingStoreOptIn();
const templates = await apiJson("/api/templates");
const health = await apiJson("/api/ai/local/health").catch(() => null);
const templateIds = new Set(
  templates.catalog?.spreadTemplates?.map((template) => template.id) ?? [],
);
const initialProject = await findProject();
const approvedBefore = getApprovedPhotos(initialProject);
const questions = await apiJson(`/api/projects/${initialProject.id}/generation/questions`);
const questionnaire = {
  ...questions.questionnaire.answers,
  audience: "The people who took the Cap Cana trip and want a polished printed keepsake.",
  coverPreference:
    "Choose the strongest Cap Cana scenic or emotional image, favoring resort light and water.",
  density: "balanced",
  tripPurpose:
    "A premium vacation photo book for the Cap Cana 2026 Trip in the Dominican Republic.",
};

const runResponse = await apiJson(`/api/projects/${initialProject.id}/generation/run`, {
  method: "POST",
  body: JSON.stringify({
    expectedRevision: initialProject.revision,
    questionnaire,
  }),
});
const project = runResponse.project;
const run = runResponse.run ?? project.generationRuns?.[0];
const acceptance = assertAcceptance(project, templateIds);
const qualityReport = run?.qualityReport;
if (qualityReport?.warnings?.length) {
  acceptance.failures.push(
    ...qualityReport.warnings.map((warning) => `quality report warning: ${warning}`),
  );
}
if (qualityReport && qualityReport.score < 75) {
  acceptance.failures.push(`quality score ${qualityReport.score}/100 is below the 75 alpha gate`);
}
const elapsedMs = Date.now() - startedAt;
const approxPromptPressureTokens = Math.round(
  JSON.stringify({
    photoCount: approvedBefore.length,
    photos: approvedBefore.map((photo) => ({
      capturedAt: photo.capturedAt,
      id: photo.id,
      locationLabel: photo.locationLabel,
      mustInclude: photo.mustInclude,
      orientation: photo.orientation,
      title: photo.title,
    })),
    questionnaire,
    templateCount: templateIds.size,
  }).length / 4,
);
const summary = {
  acceptance,
  approxPromptPressureTokens,
  elapsedMs,
  fallbackUsed: getPlannerMode(run) !== "primary-or-custom-planner",
  deterministicFallbackUsed: getPlannerMode(run) === "deterministic-fallback",
  localPlannerJsonAccepted: getPlannerMode(run) !== "deterministic-fallback",
  modelNames: run?.modelNames,
  plannerMode: getPlannerMode(run),
  projectId: project.id,
  projectRevision: project.revision,
  qualityReport,
  runId: run?.id,
  runStatus: run?.status,
  runtimeConfig: health?.ai?.config ?? null,
  validationWarnings: run?.validationWarnings ?? [],
};

console.log(JSON.stringify(summary, null, 2));
await writeReport(summary);

if (strictAcceptance && acceptance.failures.length) {
  throw new Error(`AI generation acceptance failed:\n- ${acceptance.failures.join("\n- ")}`);
}

if (strictAcceptance && disallowDeterministicFallback && summary.deterministicFallbackUsed) {
  throw new Error(
    "AI generation acceptance used deterministic fallback. Set AI_GENERATION_DISALLOW_DETERMINISTIC_FALLBACK=0 for local alpha fallback testing, or tune planner timeouts/prompts.",
  );
}

console.log("local AI generation smoke passed");
