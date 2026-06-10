import {
  buildBookGenerationQuestionnaire,
  buildFallbackPhotoInsight,
  createGenerationRun,
  getAiTemplateCatalogForPrompt,
  getPhotoInsightCacheKey,
  materializeAiBookPlan,
  parseAiBookPlanJson,
  type AiBookPlan,
  type BookGenerationQuestionnaireAnswers,
  type GenerationRun,
  type PhotoAsset,
  type PhotoInsight,
  type PlannerAttemptDiagnostic,
  type PlannerDiagnostics,
  type Project,
} from "@photo-book-maker/core";
import { Buffer } from "node:buffer";
import sharp from "sharp";
import { readStoredObjectBuffer } from "@/lib/server/object-storage";

function firstNonEmptyEnv(...values: Array<string | undefined>) {
  return values.find((value) => value?.trim());
}

function parsePositiveIntegerEnv(
  value: string | undefined,
  fallback: number,
  options: { min?: number } = {},
) {
  const parsed = Number.parseInt(value ?? "", 10);
  const min = options.min ?? 1;

  if (!Number.isFinite(parsed)) {
    return Math.max(min, fallback);
  }

  return Math.max(min, parsed);
}

const LOCAL_AI_BASE_URL = (
  process.env.LOCAL_AI_BASE_URL ??
  process.env.OLLAMA_BASE_URL ??
  process.env.OLLAMA_HOST ??
  "http://127.0.0.1:11434"
).replace(/\/$/, "");
const LOCAL_AI_PLANNER_MODEL =
  process.env.LOCAL_AI_PLANNER_MODEL ?? process.env.LOCAL_AI_MODEL ?? "qwen3:14b";
const LOCAL_AI_FALLBACK_PLANNER_MODEL =
  process.env.LOCAL_AI_FALLBACK_PLANNER_MODEL ?? "qwen3:8b";
const LOCAL_AI_VISION_MODEL =
  process.env.LOCAL_AI_VISION_MODEL ?? "qwen2.5vl:7b";
const PRIMARY_PLANNER_TIMEOUT_MS = parsePositiveIntegerEnv(
  firstNonEmptyEnv(
    process.env.LOCAL_AI_PRIMARY_PLANNER_TIMEOUT_MS,
    process.env.LOCAL_AI_PLANNER_TIMEOUT_MS,
  ),
  120000,
);
const FALLBACK_PLANNER_TIMEOUT_MS = parsePositiveIntegerEnv(
  firstNonEmptyEnv(
    process.env.LOCAL_AI_FALLBACK_PLANNER_TIMEOUT_MS,
    process.env.LOCAL_AI_PLANNER_TIMEOUT_MS,
  ),
  180000,
);
const PRIMARY_PLANNER_NUM_PREDICT = parsePositiveIntegerEnv(
  firstNonEmptyEnv(
    process.env.LOCAL_AI_PRIMARY_PLANNER_NUM_PREDICT,
    process.env.LOCAL_AI_PLANNER_NUM_PREDICT,
  ),
  1200,
);
const FALLBACK_PLANNER_NUM_PREDICT = parsePositiveIntegerEnv(
  firstNonEmptyEnv(
    process.env.LOCAL_AI_FALLBACK_PLANNER_NUM_PREDICT,
    process.env.LOCAL_AI_PLANNER_NUM_PREDICT,
  ),
  1200,
);
const PLANNER_NUM_CTX = parsePositiveIntegerEnv(
  process.env.LOCAL_AI_PLANNER_NUM_CTX,
  8192,
);
const VISION_TIMEOUT_MS = parsePositiveIntegerEnv(
  process.env.LOCAL_AI_VISION_TIMEOUT_MS,
  180000,
);
const VISION_NUM_CTX = parsePositiveIntegerEnv(
  process.env.LOCAL_AI_VISION_NUM_CTX,
  4096,
);
const VISION_IMAGE_MAX_EDGE = parsePositiveIntegerEnv(
  process.env.LOCAL_AI_VISION_IMAGE_MAX_EDGE,
  768,
);
const VISION_MAX_PHOTOS = parsePositiveIntegerEnv(
  process.env.LOCAL_AI_VISION_MAX_PHOTOS,
  4,
);
const VISION_TIME_BUDGET_MS = parsePositiveIntegerEnv(
  process.env.LOCAL_AI_VISION_TIME_BUDGET_MS,
  720000,
);
const PLANNER_MAX_PHOTOS = parsePositiveIntegerEnv(
  process.env.LOCAL_AI_PLANNER_MAX_PHOTOS,
  36,
  { min: 12 },
);

const VALID_CROP_REGIONS = new Set([
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "face",
  "wide",
  "safe-full",
]);
const VALID_FOCAL_POINTS = new Set(["center", "faces", "landscape", "detail", "unknown"]);
const VALID_IMAGE_QUALITIES = new Set(["excellent", "good", "usable", "risky"]);

function parsePlannerContent(content: string) {
  try {
    return parseAiBookPlanJson(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown parse error";
    throw new Error(`${message}. Response preview: ${content.slice(0, 1200)}`);
  }
}

function getApproxTokenCount(value: string) {
  return Math.ceil(value.length / 4);
}

function formatPlannerAttemptProgress(attempt: PlannerAttemptDiagnostic) {
  const role = attempt.role === "deterministic" ? "deterministic fallback" : `${attempt.role} planner`;
  const budget = [
    attempt.timeoutMs ? `timeout ${attempt.timeoutMs}ms` : null,
    attempt.numCtx ? `num_ctx ${attempt.numCtx}` : null,
    attempt.numPredict ? `num_predict ${attempt.numPredict}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const suffix = budget ? ` (${budget})` : "";

  return `${role} ${attempt.model} ${attempt.outcome} after ${attempt.elapsedMs}ms${suffix}`;
}

function buildPlannerDiagnostics(input: {
  attempts: PlannerAttemptDiagnostic[];
  finalPlannerModel: string;
  photoSelection: {
    approvedPhotoCount: number;
    plannerCandidateCount: number;
  };
  promptText: string;
}): PlannerDiagnostics {
  return {
    approvedPhotoCount: input.photoSelection.approvedPhotoCount,
    attemptCount: input.attempts.length,
    attempts: input.attempts,
    finalPlannerModel: input.finalPlannerModel,
    plannerCandidateCount: input.photoSelection.plannerCandidateCount,
    promptApproxTokens: getApproxTokenCount(input.promptText),
    promptBytes: Buffer.byteLength(input.promptText),
    usedDeterministicFallback: input.finalPlannerModel === "deterministic-editorial-fallback",
    usedFallback: input.finalPlannerModel !== LOCAL_AI_PLANNER_MODEL,
  };
}

type GenerationRunInput = {
  onRunUpdate?: (run: GenerationRun) => Promise<void> | void;
  questionnaire?: Partial<BookGenerationQuestionnaireAnswers>;
  runId?: string;
};

type OllamaChatMessage = {
  content: string;
  images?: string[];
  role: "system" | "user";
};

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
  response?: string;
};

type PhotoAesthetic = {
  brightness: number;
  colorfulness: number;
  saturation: number;
};

type OllamaTagsResponse = {
  models?: Array<{
    digest?: string;
    modified_at?: string;
    name?: string;
    size?: number;
  }>;
};

export function getLocalAiRuntimeConfig() {
  return {
    baseUrl: LOCAL_AI_BASE_URL,
    fallbackPlannerModel: LOCAL_AI_FALLBACK_PLANNER_MODEL,
    fallbackPlannerNumPredict: FALLBACK_PLANNER_NUM_PREDICT,
    fallbackPlannerTimeoutMs: FALLBACK_PLANNER_TIMEOUT_MS,
    plannerModel: LOCAL_AI_PLANNER_MODEL,
    plannerMaxPhotos: PLANNER_MAX_PHOTOS,
    plannerNumCtx: PLANNER_NUM_CTX,
    plannerPromptContract: "compact-spread-plan",
    plannerNumPredict: PRIMARY_PLANNER_NUM_PREDICT,
    plannerTimeoutMs: PRIMARY_PLANNER_TIMEOUT_MS,
    provider: process.env.AI_DRAFT_PROVIDER ?? "ollama",
    visionImageMaxEdge: VISION_IMAGE_MAX_EDGE,
    visionMaxPhotos: VISION_MAX_PHOTOS,
    visionModel: LOCAL_AI_VISION_MODEL,
    visionNumCtx: VISION_NUM_CTX,
    visionTimeoutMs: VISION_TIMEOUT_MS,
    visionTimeBudgetMs: VISION_TIME_BUDGET_MS,
  };
}

export async function checkLocalAiHealth() {
  const config = getLocalAiRuntimeConfig();
  const expectedModels = [
    { name: config.plannerModel, role: "planner" },
    { name: config.fallbackPlannerModel, role: "fallback-planner" },
    { name: config.visionModel, role: "vision" },
  ];

  try {
    const startedAt = Date.now();
    const response = await fetch(`${LOCAL_AI_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(2500),
    });
    const elapsedMs = Date.now() - startedAt;

    if (!response.ok) {
      return {
        config,
        elapsedMs,
        expectedModels: expectedModels.map((model) => ({
          ...model,
          installed: false,
        })),
        missingModels: expectedModels.map((model) => model.name),
        ollamaReachable: false,
        status: "unhealthy" as const,
        warning: `Ollama returned ${response.status} from /api/tags.`,
      };
    }

    const body = (await response.json()) as OllamaTagsResponse;
    const installedNames = new Set(
      (body.models ?? [])
        .map((model) => model.name)
        .filter((name): name is string => Boolean(name)),
    );
    const modelStatus = expectedModels.map((model) => ({
      ...model,
      installed: installedNames.has(model.name),
    }));
    const missingModels = modelStatus
      .filter((model) => !model.installed)
      .map((model) => model.name);

    return {
      config,
      elapsedMs,
      expectedModels: modelStatus,
      installedModelCount: installedNames.size,
      missingModels,
      ollamaReachable: true,
      status: missingModels.length ? "degraded" as const : "healthy" as const,
      warning: missingModels.length
        ? `Missing local model(s): ${missingModels.join(", ")}.`
        : null,
    };
  } catch (error) {
    return {
      config,
      elapsedMs: null,
      expectedModels: expectedModels.map((model) => ({
        ...model,
        installed: false,
      })),
      missingModels: expectedModels.map((model) => model.name),
      ollamaReachable: false,
      status: "unhealthy" as const,
      warning:
        error instanceof Error
          ? `Ollama is not reachable: ${error.message}`
          : "Ollama is not reachable.",
    };
  }
}

function normalizeJsonResponse(responseBody: OllamaChatResponse) {
  return (responseBody.message?.content ?? responseBody.response ?? "").trim();
}

async function postOllamaJson(input: {
  format?: "json";
  messages: OllamaChatMessage[];
  model: string;
  numCtx: number;
  numPredict: number;
  temperature: number;
  timeoutMs: number;
}) {
  const response = await fetch(`${LOCAL_AI_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      think: false,
      model: input.model,
      stream: false,
      format: input.format,
      options: {
        num_ctx: input.numCtx,
        num_predict: input.numPredict,
        temperature: input.temperature,
      },
      messages: input.messages,
    }),
    signal: AbortSignal.timeout(input.timeoutMs),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama ${input.model} failed: ${response.status} ${errorText}`);
  }

  const body = (await response.json()) as OllamaChatResponse;
  const content = normalizeJsonResponse(body);
  if (!content) {
    throw new Error(`Ollama ${input.model} returned an empty response.`);
  }

  return content;
}

async function notifyGenerationRun(
  input: GenerationRunInput,
  run: GenerationRun,
) {
  try {
    await input.onRunUpdate?.(run);
  } catch {
    // Generation should continue even when progress persistence is temporarily unavailable.
  }
}

async function readPhotoImageBase64(photo: PhotoAsset) {
  if (!photo.storagePath) {
    return null;
  }

  const file = await readStoredObjectBuffer(photo.storagePath);
  if (!file) {
    return null;
  }

  const image = await sharp(file)
    .rotate()
    .resize({
      fit: "inside",
      height: VISION_IMAGE_MAX_EDGE,
      width: VISION_IMAGE_MAX_EDGE,
      withoutEnlargement: true,
    })
    .jpeg({ quality: 74 })
    .toBuffer();

  return image.toString("base64");
}

async function analyzePhotoAesthetic(photo: PhotoAsset): Promise<PhotoAesthetic | null> {
  if (!photo.storagePath) {
    return null;
  }

  try {
    const file = await readStoredObjectBuffer(photo.storagePath);
    if (!file) {
      return null;
    }

    const { data, info } = await sharp(file)
      .rotate()
      .resize({
        fit: "inside",
        height: 96,
        width: 96,
        withoutEnlargement: true,
      })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = Math.max(1, info.channels);
    const pixels = Math.max(1, info.width * info.height);
    let luminanceTotal = 0;
    let saturationTotal = 0;
    let colorDeltaTotal = 0;

    for (let index = 0; index < data.length; index += channels) {
      const red = data[index] ?? 0;
      const green = data[index + 1] ?? red;
      const blue = data[index + 2] ?? red;
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      luminanceTotal += (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
      saturationTotal += max > 0 ? (max - min) / max : 0;
      colorDeltaTotal += (Math.abs(red - green) + Math.abs(green - blue) + Math.abs(blue - red)) / (3 * 255);
    }

    return {
      brightness: luminanceTotal / pixels,
      colorfulness: colorDeltaTotal / pixels,
      saturation: saturationTotal / pixels,
    };
  } catch {
    return null;
  }
}

async function analyzeProjectPhotoAesthetics(project: Project) {
  const entries = await Promise.all(
    project.photos
      .filter((photo) => photo.approved)
      .map(async (photo) => [photo.id, await analyzePhotoAesthetic(photo)] as const),
  );
  return Object.fromEntries(
    entries.filter((entry): entry is readonly [string, PhotoAesthetic] => Boolean(entry[1])),
  );
}

function parseVisionInsightJson(
  photo: PhotoAsset,
  cacheKey: string,
  responseText: string,
): PhotoInsight {
  const fallback = buildFallbackPhotoInsight(photo);
  let parsed: unknown;

  try {
    parsed = JSON.parse(
      responseText.trim().startsWith("{")
        ? responseText.trim()
        : responseText.slice(responseText.indexOf("{"), responseText.lastIndexOf("}") + 1),
    );
  } catch {
    return fallback;
  }

  if (!parsed || typeof parsed !== "object") {
    return fallback;
  }

  const payload = parsed as Partial<PhotoInsight>;
  const sceneTags = Array.isArray(payload.sceneTags)
    ? payload.sceneTags.filter((tag): tag is string => typeof tag === "string").slice(0, 8)
    : fallback.sceneTags;
  const captionClues = Array.isArray(payload.captionClues)
    ? payload.captionClues.filter((clue): clue is string => typeof clue === "string").slice(0, 6)
    : fallback.captionClues;
  const cropSafeRegion =
    typeof payload.cropSafeRegion === "string" && VALID_CROP_REGIONS.has(payload.cropSafeRegion)
      ? payload.cropSafeRegion
      : fallback.cropSafeRegion;
  const focalPoint =
    typeof payload.focalPoint === "string" && VALID_FOCAL_POINTS.has(payload.focalPoint)
      ? payload.focalPoint
      : fallback.focalPoint;
  const imageQuality =
    typeof payload.imageQuality === "string" && VALID_IMAGE_QUALITIES.has(payload.imageQuality)
      ? payload.imageQuality
      : fallback.imageQuality;
  const rawPeopleCount = payload.peopleCount;
  const peopleCount =
    typeof rawPeopleCount === "number" && Number.isFinite(rawPeopleCount)
      ? rawPeopleCount
      : typeof rawPeopleCount === "string"
        ? Number.parseInt(rawPeopleCount, 10)
        : fallback.peopleCount;

  return {
    ...fallback,
    cacheKey,
    captionClues,
    cropSafeRegion,
    focalPoint,
    hasFood: Boolean(payload.hasFood ?? fallback.hasFood),
    hasPanorama: Boolean(payload.hasPanorama ?? fallback.hasPanorama),
    hasPeople: Boolean(payload.hasPeople ?? fallback.hasPeople),
    hasSelfie: Boolean(payload.hasSelfie ?? fallback.hasSelfie),
    hasText: Boolean(payload.hasText ?? fallback.hasText),
    imageQuality,
    peopleCount: Number.isFinite(peopleCount) ? Math.max(0, Math.round(peopleCount)) : fallback.peopleCount,
    photoId: photo.id,
    sceneTags,
  };
}

function rankPhotosForVision(photos: PhotoAsset[]) {
  return [...photos].sort((left, right) => {
    const leftScore =
      (left.mustInclude ? 100 : 0) +
      (left.orientation === "landscape" ? 12 : 0) +
      (left.locationLabel ? 8 : 0) +
      (left.peopleIds.length ? 6 : 0) +
      Math.max(...left.versions.map((version) => version.width * version.height), 0) / 1_000_000;
    const rightScore =
      (right.mustInclude ? 100 : 0) +
      (right.orientation === "landscape" ? 12 : 0) +
      (right.locationLabel ? 8 : 0) +
      (right.peopleIds.length ? 6 : 0) +
      Math.max(...right.versions.map((version) => version.width * version.height), 0) / 1_000_000;

    return rightScore - leftScore;
  });
}

async function analyzePhotoWithVision(
  photo: PhotoAsset,
  warnings: string[],
) {
  const cacheKey = getPhotoInsightCacheKey(photo);
  const imageBase64 = await readPhotoImageBase64(photo).catch(() => null);
  if (!imageBase64) {
    warnings.push(`${photo.title} used metadata-only insight because no stored image file was readable.`);
    return buildFallbackPhotoInsight(photo);
  }

  try {
    const content = await postOllamaJson({
      format: "json",
      messages: [
        {
          role: "system",
          content:
            "You are a photo-book image editor. Return compact JSON only. Describe visible scene, quality, focal point, crop-safe region, and caption clues for print layout.",
        },
        {
          role: "user",
          images: [imageBase64],
          content: `Analyze this photo for a premium printed vacation photo book.
Return exactly:
{"sceneTags":["string"],"peopleCount":0,"imageQuality":"excellent|good|usable|risky","cropSafeRegion":"center|top|bottom|left|right|face|wide|safe-full","focalPoint":"center|faces|landscape|detail|unknown","hasText":false,"hasFood":false,"hasSelfie":false,"hasPanorama":false,"hasPeople":false,"captionClues":["string"]}
Metadata: ${JSON.stringify({
  capturedAt: photo.capturedAt,
  locationLabel: photo.locationLabel,
  orientation: photo.orientation,
  qualityNotes: photo.qualityNotes,
  title: photo.title,
})}`,
        },
      ],
      model: LOCAL_AI_VISION_MODEL,
      numCtx: VISION_NUM_CTX,
      numPredict: 500,
      temperature: 0.1,
      timeoutMs: VISION_TIMEOUT_MS,
    });

    return parseVisionInsightJson(photo, cacheKey, content);
  } catch (error) {
    warnings.push(
      `${photo.title} used metadata-only insight because ${LOCAL_AI_VISION_MODEL} failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return buildFallbackPhotoInsight(photo);
  }
}

async function analyzeProjectPhotos(project: Project, run: GenerationRun) {
  const insights: Record<string, PhotoInsight> = { ...(project.photoInsights ?? {}) };
  const warnings = [...run.validationWarnings];
  const approvedPhotos = project.photos.filter((photo) => photo.approved);
  const visionStartedAt = Date.now();
  let analyzedWithVision = 0;
  let analyzedWithMetadata = 0;

  for (const photo of rankPhotosForVision(approvedPhotos)) {
    const cacheKey = getPhotoInsightCacheKey(photo);
    if (insights[photo.id]?.cacheKey === cacheKey) {
      continue;
    }

    const budgetExceeded =
      analyzedWithVision >= VISION_MAX_PHOTOS ||
      Date.now() - visionStartedAt >= VISION_TIME_BUDGET_MS;
    if (budgetExceeded) {
      insights[photo.id] = buildFallbackPhotoInsight(photo);
      analyzedWithMetadata += 1;
      continue;
    }

    insights[photo.id] = await analyzePhotoWithVision(photo, warnings);
    analyzedWithVision += 1;
  }

  if (analyzedWithMetadata > 0) {
    warnings.push(
      `${analyzedWithMetadata} photo insight(s) used metadata because the local vision budget is ${VISION_MAX_PHOTOS} photos / ${Math.round(
        VISION_TIME_BUDGET_MS / 1000,
      )}s. Increase LOCAL_AI_VISION_MAX_PHOTOS or LOCAL_AI_VISION_TIME_BUDGET_MS for deeper analysis.`,
    );
  }

  return {
    insights,
    run: {
      ...run,
      progress: [
        ...run.progress,
        `analyzed ${analyzedWithVision} photos with ${LOCAL_AI_VISION_MODEL}`,
        `filled ${analyzedWithMetadata} photo insight(s) from metadata`,
      ],
      status: "planning" as const,
      validationWarnings: warnings,
    },
  };
}

function getPlannerPhotoCandidateTarget(photoCount: number) {
  if (photoCount <= 25) {
    return photoCount;
  }

  const configuredMax = Math.max(12, PLANNER_MAX_PHOTOS);
  const usageTarget =
    photoCount >= 120
      ? Math.ceil(photoCount * 0.45)
      : photoCount >= 80
        ? Math.ceil(photoCount * 0.55)
        : photoCount >= 50
          ? Math.ceil(photoCount * 0.35)
          : Math.ceil(photoCount * 0.55);
  const largeAlbumTarget = Math.max(24, Math.ceil(usageTarget * 1.25));

  return Math.min(photoCount, configuredMax, largeAlbumTarget);
}

function addPlannerCandidate(
  selected: Map<string, PhotoAsset>,
  photo: PhotoAsset | undefined,
  targetCount: number,
) {
  if (!photo) {
    return;
  }

  if (photo.mustInclude || selected.size < targetCount) {
    selected.set(photo.id, photo);
  }
}

function selectPlannerCandidatePhotos(input: {
  aesthetics: Record<string, PhotoAesthetic>;
  insights: Record<string, PhotoInsight>;
  project: Project;
}) {
  const approvedPhotos = input.project.photos
    .filter((photo) => photo.approved)
    .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
  const targetCount = getPlannerPhotoCandidateTarget(approvedPhotos.length);
  const selected = new Map<string, PhotoAsset>();
  const rankedOverall = [...approvedPhotos].sort(
    (left, right) =>
      getPlannerPhotoScore(right, input.insights[right.id], input.aesthetics[right.id]) -
        getPlannerPhotoScore(left, input.insights[left.id], input.aesthetics[left.id]) ||
      left.capturedAt.localeCompare(right.capturedAt),
  );
  const storyBeats: Array<AiBookPlan["spreadPlans"][number]["storyBeat"]> = [
    "opener",
    "scene_setter",
    "highlight",
    "details",
    "reflection",
    "closing",
  ];

  for (const photo of approvedPhotos.filter((photo) => photo.mustInclude)) {
    addPlannerCandidate(selected, photo, targetCount);
  }

  for (const photo of rankedOverall.slice(0, Math.ceil(targetCount * 0.45))) {
    addPlannerCandidate(selected, photo, targetCount);
  }

  for (const storyBeat of storyBeats) {
    const rankedForBeat = [...approvedPhotos].sort(
      (left, right) =>
        getFallbackBeatPhotoScore(
          right,
          input.insights[right.id],
          input.aesthetics[right.id],
          storyBeat,
        ) -
          getFallbackBeatPhotoScore(
            left,
            input.insights[left.id],
            input.aesthetics[left.id],
            storyBeat,
          ) ||
        left.capturedAt.localeCompare(right.capturedAt),
    );

    for (const photo of rankedForBeat.slice(0, 4)) {
      addPlannerCandidate(selected, photo, targetCount);
    }
  }

  const anchorCount = Math.min(8, approvedPhotos.length);
  for (let index = 0; index < anchorCount; index += 1) {
    const anchorIndex = Math.round(
      (index * Math.max(approvedPhotos.length - 1, 0)) / Math.max(anchorCount - 1, 1),
    );
    addPlannerCandidate(selected, approvedPhotos[anchorIndex], targetCount);
  }

  for (const photo of rankedOverall) {
    addPlannerCandidate(selected, photo, targetCount);
  }

  return [...selected.values()].sort((left, right) =>
    left.capturedAt.localeCompare(right.capturedAt),
  );
}

function getPlannerTemplateCatalog(templatePackId: string | null | undefined) {
  const catalog = getAiTemplateCatalogForPrompt(templatePackId);
  const preferredTemplateIds = new Set([
    "full-bleed-1",
    "full-bleed-2",
    "hero-1",
    "hero-2",
    "minimal-grid-1",
    "minimal-grid-2",
    "caption-1",
    "timeline-1",
    "collage-1",
    "panorama-1",
    "photo-journal-1",
    "burst-sequence-1",
  ]);
  const spreadTemplates = catalog.spreadTemplates.filter((template) =>
    preferredTemplateIds.has(template.id),
  );
  const selectedSpreadTemplates = spreadTemplates.length
    ? spreadTemplates
    : catalog.spreadTemplates;

  return {
    ...catalog,
    bookTemplatePacks: catalog.bookTemplatePacks.map((pack) => ({
      ...pack,
      spreadTemplateIds: pack.spreadTemplateIds.filter((templateId) =>
        selectedSpreadTemplates.some((template) => template.id === templateId),
      ),
    })),
    spreadTemplates: selectedSpreadTemplates,
  };
}

function getVisibleTemplateFallbackId(
  allowedTemplateIds: Set<string>,
  storyBeat: AiBookPlan["spreadPlans"][number]["storyBeat"],
) {
  const candidates =
    storyBeat === "opener"
      ? ["panorama-1", "full-bleed-1", "hero-1", "full-bleed-2"]
      : storyBeat === "details"
        ? ["burst-sequence-1", "minimal-grid-1", "collage-1", "minimal-grid-2"]
        : storyBeat === "reflection" || storyBeat === "closing"
          ? ["photo-journal-1", "caption-1", "minimal-grid-2", "full-bleed-2"]
          : ["timeline-1", "photo-journal-1", "hero-2", "hero-1"];

  return candidates.find((templateId) => allowedTemplateIds.has(templateId)) ??
    [...allowedTemplateIds][0] ??
    "hero-1";
}

function enforcePlannerVisibleTemplateCatalog(
  plan: AiBookPlan,
  allowedTemplateIds: Set<string>,
) {
  const remappedTemplateIds = new Set<string>();
  const spreadPlans = plan.spreadPlans.map((spread) => {
    if (allowedTemplateIds.has(spread.templateId)) {
      return spread;
    }

    remappedTemplateIds.add(spread.templateId);

    return {
      ...spread,
      templateId: getVisibleTemplateFallbackId(allowedTemplateIds, spread.storyBeat),
    };
  });
  const warnings = remappedTemplateIds.size
    ? [
        `Planner requested template(s) outside its visible catalog and the server remapped them: ${[
          ...remappedTemplateIds,
        ].join(", ")}.`,
      ]
    : [];

  return {
    plan: {
      ...plan,
      spreadPlans,
      warnings: [...plan.warnings, ...warnings],
    },
    warnings,
  };
}

function summarizePlanPhotoSelection(plan: AiBookPlan, candidatePhotoIds: Set<string>) {
  const plannedPhotoIds = new Set(plan.spreadPlans.flatMap((spread) => spread.photoIds));
  const unknownPhotoIds = [...plannedPhotoIds].filter((photoId) => !candidatePhotoIds.has(photoId));

  return {
    plannedPhotoCount: plannedPhotoIds.size,
    unknownPhotoCount: unknownPhotoIds.length,
    validCandidatePhotoCount: plannedPhotoIds.size - unknownPhotoIds.length,
  };
}

function getPlannerPhotoAliases(index: number) {
  const ordinal = index + 1;
  const paddedOrdinal = String(ordinal).padStart(2, "0");

  return [`p${paddedOrdinal}`, `p${ordinal}`, `photo-${ordinal}`, `photo_${ordinal}`];
}

function buildPlannerPhotoAliasMap(photos: Array<{ id: string }>) {
  const realPhotoIds = new Set(photos.map((photo) => photo.id));
  const aliasMap = new Map<string, string>();

  photos.forEach((photo, index) => {
    for (const alias of getPlannerPhotoAliases(index)) {
      if (!realPhotoIds.has(alias)) {
        aliasMap.set(alias.toLowerCase(), photo.id);
      }
    }
  });

  return aliasMap;
}

function normalizePlannerPhotoAliases(
  plan: AiBookPlan,
  candidatePhotoIds: Set<string>,
  aliasMap: Map<string, string>,
) {
  let replacedAliasCount = 0;
  const spreadPlans = plan.spreadPlans.map((spread) => ({
    ...spread,
    photoIds: spread.photoIds.map((photoId) => {
      if (candidatePhotoIds.has(photoId)) {
        return photoId;
      }

      const aliasedPhotoId = aliasMap.get(photoId.trim().toLowerCase());
      if (aliasedPhotoId) {
        replacedAliasCount += 1;
        return aliasedPhotoId;
      }

      return photoId;
    }),
  }));

  if (!replacedAliasCount) {
    return plan;
  }

  return {
    ...plan,
    spreadPlans,
    warnings: [
      ...plan.warnings,
      `Planner used ${replacedAliasCount} short photo alias(es); the server mapped them to uploaded photo IDs.`,
    ],
  };
}

function buildPlannerPrompt(input: {
  aesthetics: Record<string, PhotoAesthetic>;
  insights: Record<string, PhotoInsight>;
  project: Project;
  questionnaire: BookGenerationQuestionnaireAnswers;
}) {
  const approvedPhotos = input.project.photos.filter((photo) => photo.approved);
  const plannerPhotos = selectPlannerCandidatePhotos(input);

  return {
    instructions: [
      "Create a premium printed photo-book plan.",
      "Do not invent templates, photo ids, or free-form geometry.",
      "Use only the template IDs in templateCatalog.spreadTemplates.",
      "Use only the photo IDs in photos; the app has already curated the strongest planner candidates from the full upload.",
      "If a photo ID is too long, you may use that photo's alias value exactly; never invent a different photo reference.",
      "Use each candidate photo at most once.",
      "Include every mustInclude candidate photo.",
      "Use the editorial travel-story rhythm: opener, arrival/scene, hero moment, detail grid, quiet reflection, hero reset, detail grid, closer.",
      "Use 6 to 8 spreads for 13-25 photos.",
      "Use 10 to 14 spreads for 26-60 photos and curate the strongest subset instead of using every image.",
      "Return no more than 16 spreadPlans.",
      "Target at least 85% approved photo usage when enough templates support it.",
      "For 26+ photos, target the best 35-55% of approved photos with clear variety across scenery, people, food/details, and quiet moments.",
      "Use at most 4 photos per spread.",
      "Alternate hero, detail/grid, and quiet caption/reflection pages.",
      "Captions should be specific, human, concise, and avoid placeholder wording.",
      "Return compact spread plans only: id, templateId, storyBeat, photoIds, title, and caption.",
      "storyBeat must be exactly one of: opener, scene_setter, highlight, details, reflection, closing.",
      "Do not return cropIntents, photoRoles, or rationale; the deterministic validator fills those safely.",
      "Never copy outputShape placeholder values into the final plan.",
      "Return valid JSON only.",
    ],
    outputShape: {
      chapters: [{ id: "chapter-1", spreadIds: ["spread-1"], title: "Chapter title" }],
      designScore: 90,
      spreadPlans: [
        {
          caption: "Caption text",
          id: "spread-1",
          photoIds: ["photo-id"],
          storyBeat: "opener",
          templateId: "full-bleed-1",
          title: "Spread title",
        },
      ],
      summary: "Draft summary",
      warnings: [],
    },
    photoSelection: {
      approvedPhotoCount: approvedPhotos.length,
      omittedLowerScoredPhotoCount: Math.max(0, approvedPhotos.length - plannerPhotos.length),
      plannerCandidateCount: plannerPhotos.length,
      plannerMaxPhotos: PLANNER_MAX_PHOTOS,
    },
    project: {
      endDate: input.project.endDate,
      notes: input.project.notes.slice(0, 10),
      startDate: input.project.startDate,
      subtitle: input.project.subtitle,
      timezone: input.project.timezone,
      title: input.project.title,
      type: input.project.type,
    },
    questionnaire: input.questionnaire,
    photos: plannerPhotos.map((photo, index) => ({
      alias: getPlannerPhotoAliases(index)[0],
      capturedAt: photo.capturedAt,
      id: photo.id,
      insight: input.insights[photo.id]
        ? {
            captionClues: input.insights[photo.id].captionClues.slice(0, 3),
            cropSafeRegion: input.insights[photo.id].cropSafeRegion,
            focalPoint: input.insights[photo.id].focalPoint,
            imageQuality: input.insights[photo.id].imageQuality,
            peopleCount: input.insights[photo.id].peopleCount,
            sceneTags: input.insights[photo.id].sceneTags.slice(0, 4),
        }
        : null,
      aesthetic: input.aesthetics[photo.id]
        ? {
            brightness: Number(input.aesthetics[photo.id].brightness.toFixed(3)),
            colorfulness: Number(input.aesthetics[photo.id].colorfulness.toFixed(3)),
            saturation: Number(input.aesthetics[photo.id].saturation.toFixed(3)),
          }
        : null,
      locationLabel: photo.locationLabel,
      mustInclude: photo.mustInclude,
      orientation: photo.orientation,
      title: photo.title,
    })),
    templateCatalog: getPlannerTemplateCatalog(input.project.draftEditorState?.templatePackId),
  };
}

function getPhotoStoryText(photo: PhotoAsset, insight?: PhotoInsight) {
  return [
    photo.title,
    photo.locationLabel,
    ...photo.qualityNotes,
    ...(insight?.sceneTags ?? []),
    ...(insight?.captionClues ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

function getPlannerPhotoScore(photo: PhotoAsset, insight?: PhotoInsight, aesthetic?: PhotoAesthetic) {
  const haystack = getPhotoStoryText(photo, insight);
  let score =
    (photo.mustInclude ? 1000 : 0) +
    (photo.orientation === "landscape" ? 45 : photo.orientation === "square" ? 16 : 0) +
    (insight?.hasPanorama ? 42 : 0) +
    (insight?.focalPoint === "landscape" ? 34 : 0) +
    (insight?.hasPeople ? 24 : 0) +
    (insight?.imageQuality === "excellent" ? 18 : insight?.imageQuality === "good" ? 10 : 0);

  if (
    /\b(ocean|sea|beach|coast|coastal|harbor|harbour|bay|waterfront|promenade|pool|natural pools|piscinas|mountain|viewpoint|sunset|sunrise|garden|island|resort|lagoon|marina|funchal|calheta|ponta do sol|porto moniz|camara de lobos|câmara de lobos|cabo girao|cabo girão|ribeira de janela|seixal|curral|cais)\b/.test(
      haystack,
    )
  ) {
    score += 72;
  }

  if (
    /\b(food|lunch|dinner|breakfast|coffee|restaurant|wine|flowers|garden|umbrella|umbrellas|market|texture|detail|canal|tree|trees|rock|rocks)\b/.test(
      haystack,
    ) ||
    insight?.hasFood ||
    insight?.hasText ||
    insight?.focalPoint === "detail"
  ) {
    score += 24;
  }

  if (
    /\b(fixer|run down|rundown|ruin|old castle|old building|fenced|diagram|map|flag|logo|bird|pile|trash|construction|cave|storm|cloudy|black and white|monochrome|bus|coach|shuttle|parking|rusty|recycled cans|commercial|vehicle|car|van|truck|tractor|crane|road|street|industrial|warehouse)\b/.test(
      haystack,
    )
  ) {
    score -= 135;
  }

  if (aesthetic) {
    score += Math.round(aesthetic.colorfulness * 110);
    score += Math.round(aesthetic.saturation * 52);
    if (aesthetic.brightness >= 0.42 && aesthetic.brightness <= 0.78) {
      score += 42;
    } else if (aesthetic.brightness < 0.34) {
      score -= 90;
    } else if (aesthetic.brightness > 0.86) {
      score -= 22;
    }
  }

  return score;
}

function getFallbackBeatPhotoScore(
  photo: PhotoAsset,
  insight: PhotoInsight | undefined,
  aesthetic: PhotoAesthetic | undefined,
  storyBeat: AiBookPlan["spreadPlans"][number]["storyBeat"],
) {
  const haystack = getPhotoStoryText(photo, insight);
  let score = getPlannerPhotoScore(photo, insight, aesthetic);
  const isScenic =
    /\b(ocean|sea|beach|coast|coastal|harbor|harbour|bay|waterfront|pool|natural pools|piscinas|mountain|viewpoint|sunset|sunrise|garden|island|marina|calheta|ponta do sol|porto moniz|camara de lobos|câmara de lobos|cabo girao|cabo girão|ribeira de janela|seixal|curral|cais)\b/.test(
      haystack,
    ) || insight?.hasPanorama || insight?.focalPoint === "landscape";
  const isDetail =
    /\b(food|lunch|dinner|breakfast|coffee|restaurant|wine|flowers|umbrella|umbrellas|market|texture|detail|canal|tree|trees|rock|rocks|sign|menu)\b/.test(
      haystack,
    ) ||
    insight?.hasFood ||
    insight?.hasText ||
    insight?.focalPoint === "detail";
  const isWeakHero =
    /\b(fixer|run down|rundown|ruin|old castle|old building|fenced|diagram|map|flag|logo|bird|pile|trash|construction|cave|storm|cloudy|black and white|monochrome|bus|coach|shuttle|parking|rusty|recycled cans|commercial|vehicle|car|van|truck|tractor|crane|road|street|industrial|warehouse)\b/.test(
      haystack,
    );

  if (storyBeat === "opener" || storyBeat === "highlight" || storyBeat === "closing") {
    score += isScenic ? 95 : 0;
    score -= isDetail ? 110 : 0;
    score -= isWeakHero ? 130 : 0;
    score -= photo.orientation === "portrait" ? 130 : 0;
    if (aesthetic) {
      score += aesthetic.brightness >= 0.42 && aesthetic.colorfulness >= 0.08 ? 115 : 0;
      score -= aesthetic.brightness < 0.36 ? 190 : 0;
      score -= aesthetic.saturation < 0.08 ? 120 : 0;
    }
  } else if (storyBeat === "scene_setter") {
    score += isScenic ? 44 : 0;
    score += photo.locationLabel ? 22 : 0;
    score -= isWeakHero ? 70 : 0;
    if (aesthetic) {
      score += aesthetic.brightness >= 0.38 ? 40 : 0;
      score -= aesthetic.brightness < 0.3 ? 90 : 0;
    }
  } else if (storyBeat === "details") {
    score += isDetail ? 70 : 0;
    score -= isWeakHero ? 20 : 0;
    if (aesthetic) {
      score += aesthetic.colorfulness >= 0.1 ? 36 : 0;
      score -= aesthetic.brightness < 0.28 ? 36 : 0;
    }
  } else if (storyBeat === "reflection") {
    score += isScenic ? 58 : 0;
    score -= insight?.hasPeople ? 12 : 0;
    score -= isWeakHero ? 90 : 0;
    if (aesthetic) {
      score += aesthetic.brightness >= 0.4 ? 55 : 0;
      score -= aesthetic.brightness < 0.34 ? 150 : 0;
    }
  }

  return score;
}

function pickFallbackPhotosForBeat(input: {
  count: number;
  insights: Record<string, PhotoInsight>;
  aesthetics: Record<string, PhotoAesthetic>;
  photos: PhotoAsset[];
  storyBeat: AiBookPlan["spreadPlans"][number]["storyBeat"];
  usedPhotoIds: Set<string>;
}) {
  const ranked = input.photos
    .filter((photo) => !input.usedPhotoIds.has(photo.id))
    .sort((left, right) => {
      const scoreDelta =
        getFallbackBeatPhotoScore(right, input.insights[right.id], input.aesthetics[right.id], input.storyBeat) -
        getFallbackBeatPhotoScore(left, input.insights[left.id], input.aesthetics[left.id], input.storyBeat);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return left.capturedAt.localeCompare(right.capturedAt);
    });

  return ranked.slice(0, input.count);
}

function getFallbackPhotoTarget(photoCount: number) {
  if (photoCount >= 50) {
    return 15;
  }

  if (photoCount >= 26) {
    return Math.ceil(photoCount * 0.55);
  }

  return Math.ceil(photoCount * 0.85);
}

function getFallbackTemplateId(storyBeat: AiBookPlan["spreadPlans"][number]["storyBeat"], photoCount: number) {
  if (storyBeat === "opener") {
    return photoCount <= 1 ? "full-bleed-1" : "hero-1";
  }

  if (storyBeat === "scene_setter") {
    return "timeline-1";
  }

  if (storyBeat === "details") {
    return "minimal-grid-1";
  }

  if (storyBeat === "reflection" || storyBeat === "closing") {
    return photoCount <= 2 ? "caption-1" : "minimal-grid-2";
  }

  return photoCount <= 1 ? "full-bleed-2" : "hero-1";
}

function getFallbackProjectPlace(project: Project) {
  return (
    project.subtitle.match(/\b(?:Madeira|Funchal|Porto Moniz|Cap Cana|Dominican Republic|Punta Cana)\b/i)?.[0] ??
    project.title.match(/\b(?:Madeira|Funchal|Porto Moniz|Cap Cana|Dominican Republic|Punta Cana)\b/i)?.[0] ??
    project.photos.map((photo) => photo.locationLabel).find(Boolean)?.replace(/,.*$/, "") ??
    project.title
  );
}

function buildDeterministicEditorialPlan(input: {
  aesthetics: Record<string, PhotoAesthetic>;
  insights: Record<string, PhotoInsight>;
  project: Project;
  warning: string;
}): AiBookPlan {
  const projectPlace = getFallbackProjectPlace(input.project);
  const approvedPhotos = input.project.photos
    .filter((photo) => photo.approved)
    .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
  const targetPhotoCount = Math.min(
    getFallbackPhotoTarget(approvedPhotos.length),
    approvedPhotos.length,
  );
  const sequence: Array<{
    size: number;
    storyBeat: AiBookPlan["spreadPlans"][number]["storyBeat"];
    title: (cycle: number) => string;
  }> = [
    { size: 1, storyBeat: "opener", title: () => `${projectPlace} Opens Here` },
    { size: 2, storyBeat: "scene_setter", title: () => "The Trip Finds Its Place" },
    { size: 1, storyBeat: "highlight", title: () => "A Frame Worth Holding" },
    { size: 4, storyBeat: "details", title: () => "Details And Small Moments" },
    { size: 1, storyBeat: "reflection", title: () => "A Quiet Pause" },
    { size: 1, storyBeat: "highlight", title: () => "One More Standout" },
    { size: 4, storyBeat: "details", title: () => "The Texture Of The Trip" },
    { size: 1, storyBeat: "closing", title: (cycle) => (cycle > 0 ? "What The Trip Leaves Behind" : "The Part We Keep") },
  ];
  const spreadPlans: AiBookPlan["spreadPlans"] = [];
  const usedPhotoIds = new Set<string>();

  for (let index = 0; usedPhotoIds.size < targetPhotoCount && spreadPlans.length < 16; index += 1) {
    const step = sequence[index % sequence.length]!;
    const cycle = Math.floor(index / sequence.length);
    const remaining = targetPhotoCount - usedPhotoIds.size;
    const chunk = pickFallbackPhotosForBeat({
      aesthetics: input.aesthetics,
      count: Math.min(step.size, remaining),
      insights: input.insights,
      photos: approvedPhotos,
      storyBeat: step.storyBeat,
      usedPhotoIds,
    });

    if (!chunk.length) {
      break;
    }

    chunk.forEach((photo) => usedPhotoIds.add(photo.id));
    const photoIds = chunk.map((photo) => photo.id);
    const firstInsight = input.insights[chunk[0]!.id];
    const place =
      chunk.map((photo) => photo.locationLabel).find(Boolean) ??
      projectPlace;

    spreadPlans.push({
      caption:
        step.storyBeat === "details"
          ? `${place} comes through in the details: food, light, setting, and the small scenes that make the trip feel lived in.`
          : step.storyBeat === "reflection" || step.storyBeat === "closing"
            ? `${place} slows down here so the book has room for the feeling behind the photos, not only the itinerary.`
            : `${place} gives this part of the book a clear visual anchor, with ${firstInsight?.captionClues?.[0] ?? "the strongest available trip frame"} leading the page.`,
      cropIntents: photoIds.map((photoId) => ({
        photoId,
        region: input.insights[photoId]?.cropSafeRegion ?? "center",
      })),
      id: `fallback-${index + 1}`,
      photoIds,
      photoRoles: photoIds.map((photoId, photoIndex) => ({
        photoId,
        role:
          photoIndex === 0
            ? step.storyBeat === "details"
              ? "detail"
              : "hero"
            : step.storyBeat === "details"
              ? "texture"
              : "support",
      })),
      rationale:
        "The local planner timed out, so the app used the editorial trip-story fallback: opener, scene, detail grid, hero, quiet reflection, and closer.",
      storyBeat: step.storyBeat,
      templateId: getFallbackTemplateId(step.storyBeat, photoIds.length),
      title: step.title(cycle),
    });
  }

  return {
    chapters: [{ id: "chapter-1", spreadIds: spreadPlans.map((spread) => spread.id), title: input.project.title }],
    designScore: 78,
    spreadPlans,
    summary: `A print-ready editorial travel fallback for ${input.project.title}, curated from the strongest approved photos after the local planner timed out.`,
    warnings: [input.warning],
  };
}

async function requestPlannerPlan(input: {
  aesthetics: Record<string, PhotoAesthetic>;
  insights: Record<string, PhotoInsight>;
  project: Project;
  questionnaire: BookGenerationQuestionnaireAnswers;
  run: GenerationRun;
}) {
  const plannerPrompt = buildPlannerPrompt(input);
  const plannerPromptText = JSON.stringify(plannerPrompt);
  const attempts: PlannerAttemptDiagnostic[] = [];
  const primaryStartedAt = Date.now();
  const messages: OllamaChatMessage[] = [
    {
      role: "system",
      content:
        "You are BookLayoutAI, a senior photo-book art director. You design from a controlled template library and return strict JSON for a validator.",
    },
    {
      role: "user",
      content: plannerPromptText,
    },
  ];

  try {
    const content = await postOllamaJson({
      format: "json",
      messages,
      model: LOCAL_AI_PLANNER_MODEL,
      numCtx: PLANNER_NUM_CTX,
      numPredict: PRIMARY_PLANNER_NUM_PREDICT,
      temperature: 0.25,
      timeoutMs: PRIMARY_PLANNER_TIMEOUT_MS,
    });
    const candidatePhotoIds = new Set(plannerPrompt.photos.map((photo) => photo.id));
    const aliasMap = buildPlannerPhotoAliasMap(plannerPrompt.photos);
    const normalizedPlan = normalizePlannerPhotoAliases(
      parsePlannerContent(content),
      candidatePhotoIds,
      aliasMap,
    );
    const enforcedPlan = enforcePlannerVisibleTemplateCatalog(
      normalizedPlan,
      new Set(plannerPrompt.templateCatalog.spreadTemplates.map((template) => template.id)),
    );
    const planPhotoSelection = summarizePlanPhotoSelection(enforcedPlan.plan, candidatePhotoIds);
    attempts.push({
      elapsedMs: Date.now() - primaryStartedAt,
      model: LOCAL_AI_PLANNER_MODEL,
      numCtx: PLANNER_NUM_CTX,
      numPredict: PRIMARY_PLANNER_NUM_PREDICT,
      outcome: "accepted",
      role: "primary",
      timeoutMs: PRIMARY_PLANNER_TIMEOUT_MS,
    });

    return {
      diagnostics: buildPlannerDiagnostics({
        attempts,
        finalPlannerModel: LOCAL_AI_PLANNER_MODEL,
        photoSelection: plannerPrompt.photoSelection,
        promptText: plannerPromptText,
      }),
      model: LOCAL_AI_PLANNER_MODEL,
      photoSelection: plannerPrompt.photoSelection,
      plan: enforcedPlan.plan,
      planPhotoSelection,
      warnings: enforcedPlan.warnings,
    };
  } catch (primaryError) {
    const primaryErrorMessage =
      primaryError instanceof Error ? primaryError.message : "unknown error";
    const lastPrimaryAttempt = attempts.find(
      (attempt) => attempt.role === "primary" && attempt.model === LOCAL_AI_PLANNER_MODEL,
    );
    if (!lastPrimaryAttempt) {
      attempts.push({
        elapsedMs: Date.now() - primaryStartedAt,
        errorMessage: primaryErrorMessage,
        model: LOCAL_AI_PLANNER_MODEL,
        numCtx: PLANNER_NUM_CTX,
        numPredict: PRIMARY_PLANNER_NUM_PREDICT,
        outcome: "failed",
        role: "primary",
        timeoutMs: PRIMARY_PLANNER_TIMEOUT_MS,
      });
    }
    const failedPrimaryAttempt = attempts.find(
      (attempt) => attempt.role === "primary" && attempt.outcome === "failed",
    );
    const fallbackWarning = `${LOCAL_AI_PLANNER_MODEL} planner failed after ${
      failedPrimaryAttempt?.elapsedMs ?? PRIMARY_PLANNER_TIMEOUT_MS
    }ms (timeout ${PRIMARY_PLANNER_TIMEOUT_MS}ms, num_ctx ${PLANNER_NUM_CTX}, num_predict ${PRIMARY_PLANNER_NUM_PREDICT}), attempting ${LOCAL_AI_FALLBACK_PLANNER_MODEL}: ${primaryErrorMessage}`;

    if (LOCAL_AI_FALLBACK_PLANNER_MODEL === LOCAL_AI_PLANNER_MODEL) {
      const warning = `${fallbackWarning}; skipped duplicate fallback attempt because planner and fallback model are both ${LOCAL_AI_PLANNER_MODEL}`;
      const deterministicStartedAt = Date.now();
      const deterministicPlan = buildDeterministicEditorialPlan({
        aesthetics: input.aesthetics,
        insights: input.insights,
        project: input.project,
        warning,
      });
      const candidatePhotoIds = new Set(plannerPrompt.photos.map((photo) => photo.id));
      const planPhotoSelection = summarizePlanPhotoSelection(deterministicPlan, candidatePhotoIds);
      attempts.push({
        elapsedMs: Date.now() - deterministicStartedAt,
        model: "deterministic-editorial-fallback",
        outcome: "accepted",
        role: "deterministic",
      });

      return {
        diagnostics: buildPlannerDiagnostics({
          attempts,
          finalPlannerModel: "deterministic-editorial-fallback",
          photoSelection: plannerPrompt.photoSelection,
          promptText: plannerPromptText,
        }),
        model: "deterministic-editorial-fallback",
        photoSelection: plannerPrompt.photoSelection,
        plan: deterministicPlan,
        planPhotoSelection,
        warnings: [warning],
      };
    }

    const fallbackStartedAt = Date.now();
    try {
      const content = await postOllamaJson({
        format: "json",
        messages,
        model: LOCAL_AI_FALLBACK_PLANNER_MODEL,
        numCtx: PLANNER_NUM_CTX,
        numPredict: FALLBACK_PLANNER_NUM_PREDICT,
        temperature: 0.2,
        timeoutMs: FALLBACK_PLANNER_TIMEOUT_MS,
      });
      const candidatePhotoIds = new Set(plannerPrompt.photos.map((photo) => photo.id));
      const aliasMap = buildPlannerPhotoAliasMap(plannerPrompt.photos);
      const normalizedPlan = normalizePlannerPhotoAliases(
        parsePlannerContent(content),
        candidatePhotoIds,
        aliasMap,
      );
      const enforcedPlan = enforcePlannerVisibleTemplateCatalog(
        normalizedPlan,
        new Set(plannerPrompt.templateCatalog.spreadTemplates.map((template) => template.id)),
      );
      const planPhotoSelection = summarizePlanPhotoSelection(enforcedPlan.plan, candidatePhotoIds);
      attempts.push({
        elapsedMs: Date.now() - fallbackStartedAt,
        model: LOCAL_AI_FALLBACK_PLANNER_MODEL,
        numCtx: PLANNER_NUM_CTX,
        numPredict: FALLBACK_PLANNER_NUM_PREDICT,
        outcome: "accepted",
        role: "fallback",
        timeoutMs: FALLBACK_PLANNER_TIMEOUT_MS,
      });

      return {
        diagnostics: buildPlannerDiagnostics({
          attempts,
          finalPlannerModel: LOCAL_AI_FALLBACK_PLANNER_MODEL,
          photoSelection: plannerPrompt.photoSelection,
          promptText: plannerPromptText,
        }),
        model: LOCAL_AI_FALLBACK_PLANNER_MODEL,
        photoSelection: plannerPrompt.photoSelection,
        plan: enforcedPlan.plan,
        planPhotoSelection,
        warnings: [fallbackWarning, ...enforcedPlan.warnings],
      };
    } catch (fallbackError) {
      const fallbackErrorMessage =
        fallbackError instanceof Error ? fallbackError.message : "unknown error";
      attempts.push({
        elapsedMs: Date.now() - fallbackStartedAt,
        errorMessage: fallbackErrorMessage,
        model: LOCAL_AI_FALLBACK_PLANNER_MODEL,
        numCtx: PLANNER_NUM_CTX,
        numPredict: FALLBACK_PLANNER_NUM_PREDICT,
        outcome: "failed",
        role: "fallback",
        timeoutMs: FALLBACK_PLANNER_TIMEOUT_MS,
      });
      const failedFallbackAttempt = attempts.find(
        (attempt) => attempt.role === "fallback" && attempt.outcome === "failed",
      );
      const warning = `${fallbackWarning}; ${LOCAL_AI_FALLBACK_PLANNER_MODEL} fallback failed after ${
        failedFallbackAttempt?.elapsedMs ?? FALLBACK_PLANNER_TIMEOUT_MS
      }ms (timeout ${FALLBACK_PLANNER_TIMEOUT_MS}ms, num_ctx ${PLANNER_NUM_CTX}, num_predict ${FALLBACK_PLANNER_NUM_PREDICT}): ${fallbackErrorMessage}`;
      const deterministicStartedAt = Date.now();
      const deterministicPlan = buildDeterministicEditorialPlan({
        aesthetics: input.aesthetics,
        insights: input.insights,
        project: input.project,
        warning,
      });
      const candidatePhotoIds = new Set(plannerPrompt.photos.map((photo) => photo.id));
      const planPhotoSelection = summarizePlanPhotoSelection(deterministicPlan, candidatePhotoIds);
      attempts.push({
        elapsedMs: Date.now() - deterministicStartedAt,
        model: "deterministic-editorial-fallback",
        outcome: "accepted",
        role: "deterministic",
      });

      return {
        diagnostics: buildPlannerDiagnostics({
          attempts,
          finalPlannerModel: "deterministic-editorial-fallback",
          photoSelection: plannerPrompt.photoSelection,
          promptText: plannerPromptText,
        }),
        model: "deterministic-editorial-fallback",
        photoSelection: plannerPrompt.photoSelection,
        plan: deterministicPlan,
        planPhotoSelection,
        warnings: [warning],
      };
    }
  }
}

export async function generateProjectBookWithLocalAi(
  project: Project,
  input: GenerationRunInput = {},
) {
  const questionnaire = {
    ...buildBookGenerationQuestionnaire(project).answers,
    ...(input.questionnaire ?? {}),
  };
  let run = createGenerationRun({
    fallbackPlanner: LOCAL_AI_FALLBACK_PLANNER_MODEL,
    id: input.runId,
    planner: LOCAL_AI_PLANNER_MODEL,
    progress: ["generation requested"],
    status: "analyzing_photos",
    vision: LOCAL_AI_VISION_MODEL,
  });
  await notifyGenerationRun(input, run);

  const analyzed = await analyzeProjectPhotos(project, run);
  const aesthetics = await analyzeProjectPhotoAesthetics(project);
  run = {
    ...analyzed.run,
    progress: [
      ...analyzed.run.progress,
      "measured photo brightness, saturation, and color balance",
    ],
  };
  await notifyGenerationRun(input, run);

  const planner = await requestPlannerPlan({
    aesthetics,
    insights: analyzed.insights,
    project,
    questionnaire,
    run,
  });
  run = {
    ...run,
    modelNames: {
      ...run.modelNames,
      planner: planner.model,
    },
    plannerDiagnostics: planner.diagnostics,
    progress: [
      ...run.progress,
      `planner prompt budget ${planner.diagnostics.promptApproxTokens} approx tokens / ${planner.diagnostics.promptBytes} bytes`,
      ...planner.diagnostics.attempts.map(formatPlannerAttemptProgress),
      `planner saw ${planner.photoSelection.plannerCandidateCount}/${planner.photoSelection.approvedPhotoCount} photo candidates`,
      `planner selected ${planner.planPhotoSelection.validCandidatePhotoCount}/${planner.photoSelection.plannerCandidateCount} valid candidate photo ids before repair`,
      `planner returned ${planner.planPhotoSelection.unknownPhotoCount} unknown photo ids before repair`,
      "planner returned book plan",
      "validated template plan",
    ],
    status: "validating",
    validationWarnings: [...run.validationWarnings, ...planner.warnings, ...planner.plan.warnings],
  };
  await notifyGenerationRun(input, run);

  const nextProject = materializeAiBookPlan(
    {
      ...project,
      photoInsights: analyzed.insights,
    },
    planner.plan,
    {
      questionnaire,
      run,
    },
  );

  return {
    plan: planner.plan satisfies AiBookPlan,
    project: nextProject,
    run: nextProject.generationRuns?.[0] ?? run,
  };
}
