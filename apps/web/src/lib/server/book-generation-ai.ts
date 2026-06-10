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
  type Project,
} from "@photo-book-maker/core";
import sharp from "sharp";
import { readStoredObjectBuffer } from "@/lib/server/object-storage";

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
const PLANNER_TIMEOUT_MS = Number.parseInt(
  process.env.LOCAL_AI_PLANNER_TIMEOUT_MS ?? "45000",
  10,
);
const VISION_TIMEOUT_MS = Number.parseInt(
  process.env.LOCAL_AI_VISION_TIMEOUT_MS ?? "180000",
  10,
);
const VISION_IMAGE_MAX_EDGE = Number.parseInt(
  process.env.LOCAL_AI_VISION_IMAGE_MAX_EDGE ?? "768",
  10,
);
const VISION_MAX_PHOTOS = Number.parseInt(
  process.env.LOCAL_AI_VISION_MAX_PHOTOS ?? "4",
  10,
);
const VISION_TIME_BUDGET_MS = Number.parseInt(
  process.env.LOCAL_AI_VISION_TIME_BUDGET_MS ?? "720000",
  10,
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
    plannerModel: LOCAL_AI_PLANNER_MODEL,
    plannerTimeoutMs: PLANNER_TIMEOUT_MS,
    provider: process.env.AI_DRAFT_PROVIDER ?? "ollama",
    visionImageMaxEdge: VISION_IMAGE_MAX_EDGE,
    visionMaxPhotos: VISION_MAX_PHOTOS,
    visionModel: LOCAL_AI_VISION_MODEL,
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
        num_ctx: 32768,
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

function buildPlannerPrompt(input: {
  aesthetics: Record<string, PhotoAesthetic>;
  insights: Record<string, PhotoInsight>;
  project: Project;
  questionnaire: BookGenerationQuestionnaireAnswers;
}) {
  const approvedPhotos = input.project.photos.filter((photo) => photo.approved);

  return {
    instructions: [
      "Create a premium printed photo-book plan.",
      "Do not invent templates, photo ids, or free-form geometry.",
      "Use only the template IDs in templateCatalog.spreadTemplates.",
      "Use each photo at most once.",
      "Include every mustInclude photo.",
      "Use the editorial travel-story rhythm: opener, arrival/scene, hero moment, detail grid, quiet reflection, hero reset, detail grid, closer.",
      "Use 6 to 8 spreads for 13-25 photos.",
      "Use 10 to 14 spreads for 26-60 photos and curate the strongest subset instead of using every image.",
      "Return no more than 16 spreadPlans.",
      "Target at least 85% approved photo usage when enough templates support it.",
      "For 26+ photos, target the best 35-55% of approved photos with clear variety across scenery, people, food/details, and quiet moments.",
      "Use at most 4 photos per spread.",
      "Alternate hero, detail/grid, and quiet caption/reflection pages.",
      "Captions should be specific, human, concise, and avoid placeholder wording.",
      "Never copy outputShape placeholder values into the final plan.",
      "Return valid JSON only.",
    ],
    outputShape: {
      chapters: [{ id: "chapter-1", spreadIds: ["spread-1"], title: "Chapter title" }],
      designScore: 90,
      spreadPlans: [
        {
          caption: "Caption text",
          cropIntents: [{ photoId: "photo-id", region: "center" }],
          id: "spread-1",
          photoIds: ["photo-id"],
          photoRoles: [{ photoId: "photo-id", role: "hero" }],
          rationale: "Why this layout works",
          storyBeat: "opener",
          templateId: "full-bleed-1",
          title: "Spread title",
        },
      ],
      summary: "Draft summary",
      warnings: [],
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
    photos: approvedPhotos.map((photo) => ({
      capturedAt: photo.capturedAt,
      id: photo.id,
      insight: input.insights[photo.id]
        ? {
            captionClues: input.insights[photo.id].captionClues,
            cropSafeRegion: input.insights[photo.id].cropSafeRegion,
            focalPoint: input.insights[photo.id].focalPoint,
            imageQuality: input.insights[photo.id].imageQuality,
            peopleCount: input.insights[photo.id].peopleCount,
            sceneTags: input.insights[photo.id].sceneTags,
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
    templateCatalog: getAiTemplateCatalogForPrompt(input.project.draftEditorState?.templatePackId),
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
  const messages: OllamaChatMessage[] = [
    {
      role: "system",
      content:
        "You are BookLayoutAI, a senior photo-book art director. You design from a controlled template library and return strict JSON for a validator.",
    },
    {
      role: "user",
      content: JSON.stringify(plannerPrompt),
    },
  ];

  try {
    const content = await postOllamaJson({
      format: "json",
      messages,
      model: LOCAL_AI_PLANNER_MODEL,
      numPredict: 2800,
      temperature: 0.25,
      timeoutMs: PLANNER_TIMEOUT_MS,
    });

    return {
      model: LOCAL_AI_PLANNER_MODEL,
      plan: parsePlannerContent(content),
      warnings: [] as string[],
    };
  } catch (primaryError) {
    const fallbackWarning = `${LOCAL_AI_PLANNER_MODEL} planner failed, attempting ${LOCAL_AI_FALLBACK_PLANNER_MODEL}: ${
      primaryError instanceof Error ? primaryError.message : "unknown error"
    }`;
    try {
      const content = await postOllamaJson({
        format: "json",
        messages,
        model: LOCAL_AI_FALLBACK_PLANNER_MODEL,
        numPredict: 2800,
        temperature: 0.2,
        timeoutMs: PLANNER_TIMEOUT_MS,
      });

      return {
        model: LOCAL_AI_FALLBACK_PLANNER_MODEL,
        plan: parsePlannerContent(content),
        warnings: [fallbackWarning],
      };
    } catch (fallbackError) {
      const warning = `${fallbackWarning}; ${LOCAL_AI_FALLBACK_PLANNER_MODEL} fallback failed: ${
        fallbackError instanceof Error ? fallbackError.message : "unknown error"
      }`;

      return {
        model: "deterministic-editorial-fallback",
        plan: buildDeterministicEditorialPlan({
          aesthetics: input.aesthetics,
          insights: input.insights,
          project: input.project,
          warning,
        }),
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
    progress: [...run.progress, "planner returned book plan", "validated template plan"],
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
