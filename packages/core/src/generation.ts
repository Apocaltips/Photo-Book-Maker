import {
  getBookDraftFormatLabel,
  normalizeProjectDraftState,
  saveWorkingDraft,
} from "./editorial";
import {
  BOOK_TEMPLATE_PACKS,
  SPREAD_TEMPLATES,
  getBookTemplatePack,
  getSpreadTemplate,
  getTemplatesForPack,
} from "./templates";
import type {
  AiBookPlan,
  AiBookPlanChapter,
  AiBookPlanCropIntent,
  AiBookPlanPhotoRole,
  AiBookPlanSpread,
  AiCropRegion,
  AiPhotoRole,
  BookGenerationQuestion,
  BookGenerationQuestionnaire,
  BookGenerationQuestionnaireAnswers,
  BookPage,
  BookPageStoryBeat,
  GenerationRun,
  PhotoAsset,
  PhotoInsight,
  Project,
  SpreadTemplate,
} from "./types";

const MAX_AI_PHOTOS_PER_SPREAD = 4;
const DEFAULT_PLANNER_MODEL = "qwen3:14b";
const DEFAULT_VISION_MODEL = "qwen2.5vl:7b";
const FALLBACK_PLANNER_MODEL = "qwen3:8b";
const TRIP_STORY_RHYTHM: BookPageStoryBeat[] = [
  "opener",
  "scene_setter",
  "highlight",
  "details",
  "reflection",
  "highlight",
  "details",
  "scene_setter",
];
const VALID_STORY_BEATS = new Set<BookPageStoryBeat>([
  "opener",
  "scene_setter",
  "highlight",
  "details",
  "reflection",
  "closing",
]);
const VALID_PHOTO_ROLES = new Set<AiPhotoRole>([
  "hero",
  "support",
  "detail",
  "texture",
  "cover",
  "closing",
]);
const VALID_CROP_REGIONS = new Set<AiCropRegion>([
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "face",
  "wide",
  "safe-full",
]);

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId ? `${prefix}-${randomId}` : `${prefix}-${Date.now()}`;
}

function normalizeCopy(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\s+/g, " ") : fallback;
}

function normalizeDisplayPlace(value?: string | null) {
  return (value ?? "")
    .replace(/\bMadeira,\s*Madeira\b/gi, "Madeira")
    .replace(/\bCamara de Lobos\b/gi, "Camara de Lobos")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .trim();
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value || seen.has(value)) {
      return false;
    }

    seen.add(value);
    return true;
  });
}

function getPageSignature(photoIds: string[], storyBeat?: BookPageStoryBeat) {
  return `${storyBeat ?? "any"}:${[...photoIds].sort().join("|") || "text"}`;
}

function getProjectPlace(project: Project) {
  return normalizeDisplayPlace(
    project.subtitle.match(
      /\b(?:Madeira|Funchal|Porto Moniz|Camara de Lobos|Câmara de Lobos|Cap Cana|Dominican Republic|Punta Cana)\b/i,
    )?.[0] ??
    project.title.match(
      /\b(?:Madeira|Funchal|Porto Moniz|Camara de Lobos|Câmara de Lobos|Cap Cana|Dominican Republic|Punta Cana)\b/i,
    )?.[0] ??
    project.photos.map((photo) => photo.locationLabel).find(Boolean)?.replace(/,.*$/, "") ??
    project.subtitle ??
    project.title
  );
}

function getPhotoSubject(photo: PhotoAsset) {
  const title = photo.title
    .replace(/^File:/i, "")
    .replace(/^Madeira trip\s+\d+\s*-\s*/i, "")
    .replace(/\.(?:jpe?g|j|png|heic|webp)$/i, "")
    .replace(/\s*\(\d{6,}\).*$/g, "")
    .replace(/\s*\(\d{2,}.*$/g, "")
    .replace(/,\s*Madeira\s*20\d{2}.*$/i, "")
    .replace(/\s+20\d{2}(?:\s*\(\d+\))?$/g, "")
    .replace(/\s*\(\d+\)$/g, "")
    .replace(/[-\s]\d{4,}\b/g, "")
    .replace(/\b20\d{6}\./g, "")
    .replace(/\bFunchal\.\d+\b/gi, "Funchal")
    .replace(/\.(?=[A-Z])/g, " ")
    .replace(/\.\d{2,}\b/g, "")
    .replace(/\b(?:DSC|IMG|PXL)[-_ ]?\d+\b/gi, "")
    .replace(/\b(?:DSC|IMG|PXL)\b/gi, "")
    .replace(/\b\d{8,}\b/g, "")
    .replace(/\.\s*\d+\b/g, "")
    .replace(/\bPentax JH\b/gi, "")
    .replace(/\bMadeira\s+Madeira\b/gi, "Madeira")
    .replace(/^\.+|\.+$/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    title &&
    title.length >= 4 &&
    !/^(?:20\d{2}|dsc|img|\d)/i.test(title) &&
    !/\b(?:file|jpg|jpeg|png|wikimedia|creative commons)\b/i.test(title)
  ) {
    return title;
  }

  return normalizeDisplayPlace(photo.locationLabel?.replace(/,.*$/, "")) || "the view";
}

function formatSubjectList(photos: PhotoAsset[], limit = 3) {
  const uniqueSubjects = uniqueStrings(
    photos
      .map(getPhotoSubject)
      .filter((subject) => subject && !/^\d+$/.test(subject)),
  );
  const subjects = uniqueSubjects
    .filter((subject) =>
      !uniqueSubjects.some(
        (candidate) =>
          candidate !== subject &&
          subject.length < 10 &&
          candidate.toLowerCase().includes(subject.toLowerCase()),
      ),
    )
    .slice(0, limit);

  if (!subjects.length) {
    return "the strongest frames";
  }

  if (subjects.length === 1) {
    return subjects[0]!;
  }

  if (subjects.length === 2) {
    return `${subjects[0]} and ${subjects[1]}`;
  }

  return `${subjects.slice(0, -1).join(", ")}, and ${subjects[subjects.length - 1]}`;
}

function getPhotoCurationText(photo: PhotoAsset) {
  return [photo.title, photo.locationLabel, ...photo.qualityNotes]
    .join(" ")
    .toLowerCase();
}

function getPhotoCurationScore(photo: PhotoAsset) {
  const haystack = getPhotoCurationText(photo);
  let score =
    (photo.mustInclude ? 1000 : 0) +
    (photo.orientation === "landscape" ? 36 : photo.orientation === "square" ? 12 : 0) +
    (photo.locationLabel ? 12 : 0);

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
    )
  ) {
    score += 26;
  }

  if (/\b(umbrella|umbrellas|garden|flowers|wine|blandys|music|guitar|lunch|restaurant|harbor|harbour|baia|baía|câmara de lobos|camara de lobos|ponta do sol)\b/.test(haystack)) {
    score += 38;
  }

  if (
    /\b(fixer|run down|rundown|ruin|old castle|old building|fenced|diagram|map|flag|logo|bird|pile|trash|construction|cave|storm|cloudy|black and white|monochrome|bus|coach|shuttle|parking|rusty|recycled cans|commercial|vehicle|car|van|truck|tractor|crane|road|street|industrial|warehouse)\b/.test(
      haystack,
    )
  ) {
    score -= 135;
  }

  if (/\b(ribeira de janela|rock|rocks|stone|dsc)\b/.test(haystack)) {
    score -= 42;
  }

  if (/\b20\d{6}\.|pentax jh|\bdsc\b|\.-\d{2,}\b|funchal\.\d{2,}\b|lobos\.-\d{2,}\b/.test(haystack)) {
    score -= 58;
  }

  return score;
}

function getPhotoDiversityKey(photo: PhotoAsset) {
  const haystack = `${photo.title} ${photo.locationLabel ?? ""} ${photo.qualityNotes.join(" ")}`.toLowerCase();

  if (/\b(lunch|restaurant|food|dinner|breakfast|coffee|table)\b/.test(haystack)) {
    return "food";
  }

  if (/\b(wine|blandys|music|guitar)\b/.test(haystack)) {
    return "wine-music";
  }

  if (/\b(umbrella|umbrellas|market|color)\b/.test(haystack)) {
    return "street-color";
  }

  if (/\b(garden|flowers|palm|tree|trees)\b/.test(haystack)) {
    return "garden";
  }

  if (/\b(baia|baía|harbor|harbour|marina|câmara de lobos|camara de lobos|boat|boats)\b/.test(haystack)) {
    return "harbor";
  }

  if (/\b(cabo|curral|mountain|valley|viewpoint|calheta)\b/.test(haystack)) {
    return "mountain";
  }

  if (/\b(ponta do sol|cais|promenade|waterfront|seixal|porto moniz|pool|piscinas)\b/.test(haystack)) {
    return "coast";
  }

  if (/\b(ribeira de janela|rock|rocks|stone)\b/.test(haystack)) {
    return "rock-coast";
  }

  return normalizeDisplayPlace(photo.locationLabel?.replace(/,.*$/, "")) || photo.orientation;
}

function interleavePhotosByDiversity(photos: PhotoAsset[]) {
  const grouped = new Map<string, PhotoAsset[]>();
  for (const photo of photos) {
    const key = getPhotoDiversityKey(photo);
    grouped.set(key, [...(grouped.get(key) ?? []), photo]);
  }

  const ordered: PhotoAsset[] = [];
  const recentKeys: string[] = [];

  while (grouped.size) {
    const candidates = [...grouped.entries()].sort((left, right) => {
      const leftRecentPenalty = recentKeys.includes(left[0]) ? 72 : 0;
      const rightRecentPenalty = recentKeys.includes(right[0]) ? 72 : 0;
      const leftTopScore = getPhotoCurationScore(left[1][0]!);
      const rightTopScore = getPhotoCurationScore(right[1][0]!);

      return (
        leftRecentPenalty - rightRecentPenalty ||
        rightTopScore - leftTopScore ||
        right[1].length - left[1].length ||
        left[0].localeCompare(right[0])
      );
    });
    const [selectedKey, selectedPhotos] = candidates[0]!;
    const selectedPhoto = selectedPhotos.shift();

    if (selectedPhoto) {
      ordered.push(selectedPhoto);
      recentKeys.push(selectedKey);
      if (recentKeys.length > 2) {
        recentKeys.shift();
      }
    }

    if (!selectedPhotos.length) {
      grouped.delete(selectedKey);
    }
  }

  return ordered;
}

function getPhotoLongEdge(photo: PhotoAsset) {
  const largestVersion = [...photo.versions].sort(
    (left, right) => right.width * right.height - left.width * left.height,
  )[0];
  return largestVersion ? Math.max(largestVersion.width, largestVersion.height) : 0;
}

function getDefaultQuestionnaireAnswers(project: Project): BookGenerationQuestionnaireAnswers {
  const normalizedProject = normalizeProjectDraftState(project);
  const editorState = normalizedProject.draftEditorState!;

  return {
    audience: "The people who took the trip",
    bookSize: editorState.formatId,
    captionDepth: "balanced",
    coverPreference: "Choose the strongest scenic or emotional image automatically.",
    density: editorState.density >= 70 ? "full" : editorState.density <= 40 ? "airy" : "balanced",
    mapMemorabiliaPreference: editorState.showMaps || editorState.showMemorabilia
      ? "Include light map or detail moments when they improve the story."
      : "Keep the design photo-led without maps or memorabilia.",
    mustIncludeMoments: normalizedProject.photos
      .filter((photo) => photo.mustInclude)
      .map((photo) => photo.title)
      .join(", "),
    namesPrivacy: "Use first names only when the project already has people tagged.",
    tone: editorState.captionTone,
    tripPurpose:
      normalizedProject.type === "yearbook"
        ? "A polished printed recap of the year."
        : "A polished printed memory book for this trip.",
  };
}

function getEditorDensityFromGenerationDensity(
  density?: BookGenerationQuestionnaireAnswers["density"],
) {
  switch (density) {
    case "airy":
      return 42;
    case "full":
      return 76;
    case "balanced":
      return 58;
    default:
      return undefined;
  }
}

function getQuestionnaireDetailPreferences(
  preference?: BookGenerationQuestionnaireAnswers["mapMemorabiliaPreference"],
) {
  const normalized = preference?.toLowerCase() ?? "";
  const explicitlySkipped = /\b(no|skip|without|none|don't|do not)\b/.test(normalized);

  return {
    showMaps: !explicitlySkipped && /\b(map|route|itinerary|location|where)\b/.test(normalized),
    showMemorabilia:
      !explicitlySkipped && /\b(food|menu|ticket|receipt|detail|details|memorabilia|small)\b/.test(normalized),
  };
}

function buildQuestion(
  id: BookGenerationQuestion["id"],
  label: string,
  prompt: string,
  defaultAnswer: string,
  required = true,
): BookGenerationQuestion {
  return {
    defaultAnswer,
    id,
    label,
    prompt,
    required,
  };
}

export function buildBookGenerationQuestionnaire(project: Project): BookGenerationQuestionnaire {
  const normalizedProject = normalizeProjectDraftState(project);
  const defaults = {
    ...getDefaultQuestionnaireAnswers(normalizedProject),
    ...(normalizedProject.generationQuestionnaire ?? {}),
  };

  return {
    answers: defaults,
    questions: [
      buildQuestion(
        "tripPurpose",
        "Book purpose",
        "What should this photo book feel like when someone opens it?",
        defaults.tripPurpose,
      ),
      buildQuestion(
        "audience",
        "Audience",
        "Who is the book mainly for?",
        defaults.audience,
      ),
      buildQuestion(
        "bookSize",
        "Book size",
        "What print format should the AI design around?",
        defaults.bookSize,
      ),
      buildQuestion(
        "mustIncludeMoments",
        "Must-include moments",
        "Which moments or photos must make it into the book?",
        defaults.mustIncludeMoments || "Use the best story moments automatically.",
        false,
      ),
      buildQuestion(
        "coverPreference",
        "Cover direction",
        "What kind of photo should lead the book?",
        defaults.coverPreference,
      ),
      buildQuestion(
        "namesPrivacy",
        "Names and privacy",
        "How should names and private details be handled?",
        defaults.namesPrivacy,
      ),
      buildQuestion(
        "mapMemorabiliaPreference",
        "Maps and details",
        "Should the AI include route, map, food, ticket, or detail pages?",
        defaults.mapMemorabiliaPreference,
      ),
      buildQuestion(
        "captionDepth",
        "Caption depth",
        "How much writing should the book include?",
        defaults.captionDepth,
      ),
      buildQuestion(
        "density",
        "Page fullness",
        "How full should each page feel?",
        defaults.density,
      ),
      buildQuestion(
        "tone",
        "Writing tone",
        "What should the captions sound like?",
        defaults.tone,
      ),
    ],
  };
}

export function getPhotoInsightCacheKey(photo: PhotoAsset) {
  return [
    photo.id,
    photo.storagePath ?? photo.imageUri ?? "local",
    photo.capturedAt,
    photo.versions
      .map((version) => `${version.label}:${version.width}x${version.height}`)
      .join(","),
  ].join("|");
}

export function buildFallbackPhotoInsight(photo: PhotoAsset): PhotoInsight {
  const longEdge = getPhotoLongEdge(photo);
  const haystack = `${photo.title} ${photo.qualityNotes.join(" ")}`.toLowerCase();
  const hasFood = /\b(food|coffee|dinner|breakfast|lunch|drink|restaurant|table)\b/.test(haystack);
  const hasText = /\b(ticket|menu|sign|receipt|map|card|text)\b/.test(haystack);
  const hasSelfie = /\bselfie\b/.test(haystack);
  const hasPanorama =
    photo.orientation === "landscape" &&
    photo.versions.some((version) => version.width / version.height >= 1.75);
  const sceneTags = uniqueStrings([
    photo.locationLabel ? "location" : "",
    photo.orientation,
    hasFood ? "food/detail" : "",
    hasText ? "memorabilia/text" : "",
    hasSelfie ? "selfie" : "",
    hasPanorama ? "panorama" : "",
    photo.mustInclude ? "must-include" : "",
  ]);

  return {
    cacheKey: getPhotoInsightCacheKey(photo),
    captionClues: uniqueStrings([
      photo.locationLabel ?? "",
      photo.title,
      ...photo.qualityNotes.slice(0, 2),
    ]),
    cropSafeRegion: hasSelfie || photo.peopleIds.length ? "face" : hasPanorama ? "wide" : "center",
    focalPoint: photo.peopleIds.length ? "faces" : hasFood || hasText ? "detail" : hasPanorama ? "landscape" : "center",
    hasFood,
    hasPanorama,
    hasPeople: photo.peopleIds.length > 0,
    hasSelfie,
    hasText,
    imageQuality: longEdge >= 3000 ? "excellent" : longEdge >= 1800 ? "good" : longEdge >= 1000 ? "usable" : "risky",
    peopleCount: photo.peopleIds.length,
    photoId: photo.id,
    sceneTags,
  };
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function parsePhotoRoles(value: unknown): AiBookPlanPhotoRole[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const candidate = entry as { photoId?: unknown; role?: unknown };
    if (
      typeof candidate.photoId !== "string" ||
      typeof candidate.role !== "string" ||
      !VALID_PHOTO_ROLES.has(candidate.role as AiPhotoRole)
    ) {
      return [];
    }

    return [{ photoId: candidate.photoId, role: candidate.role as AiPhotoRole }];
  });
}

function parseCropIntents(value: unknown): AiBookPlanCropIntent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const candidate = entry as { photoId?: unknown; region?: unknown };
    if (
      typeof candidate.photoId !== "string" ||
      typeof candidate.region !== "string" ||
      !VALID_CROP_REGIONS.has(candidate.region as AiCropRegion)
    ) {
      return [];
    }

    return [{ photoId: candidate.photoId, region: candidate.region as AiCropRegion }];
  });
}

function parseChapter(value: unknown): AiBookPlanChapter | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as { id?: unknown; spreadIds?: unknown; title?: unknown };
  if (typeof candidate.id !== "string" || typeof candidate.title !== "string") {
    return null;
  }

  return {
    id: candidate.id,
    spreadIds: asStringArray(candidate.spreadIds),
    title: candidate.title,
  };
}

function parseSpread(value: unknown): AiBookPlanSpread | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    caption?: unknown;
    cropIntents?: unknown;
    id?: unknown;
    photoIds?: unknown;
    photoRoles?: unknown;
    rationale?: unknown;
    storyBeat?: unknown;
    templateId?: unknown;
    title?: unknown;
  };

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.templateId !== "string" ||
    typeof candidate.storyBeat !== "string" ||
    !VALID_STORY_BEATS.has(candidate.storyBeat as BookPageStoryBeat)
  ) {
    return null;
  }

  return {
    caption: typeof candidate.caption === "string" ? candidate.caption : "",
    cropIntents: parseCropIntents(candidate.cropIntents),
    id: candidate.id,
    photoIds: asStringArray(candidate.photoIds),
    photoRoles: parsePhotoRoles(candidate.photoRoles),
    rationale: typeof candidate.rationale === "string" ? candidate.rationale : "",
    storyBeat: candidate.storyBeat as BookPageStoryBeat,
    templateId: candidate.templateId,
    title: typeof candidate.title === "string" ? candidate.title : "",
  };
}

export function parseAiBookPlanJson(outputText: string): AiBookPlan {
  const trimmedText = outputText.trim();
  const candidateJson =
    trimmedText.startsWith("{") && trimmedText.endsWith("}")
      ? trimmedText
      : trimmedText.slice(trimmedText.indexOf("{"), trimmedText.lastIndexOf("}") + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidateJson);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON.";
    throw new Error(`AI book plan returned invalid JSON: ${message}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI book plan returned an invalid payload.");
  }

  const payload = parsed as {
    chapters?: unknown;
    designScore?: unknown;
    spreadPlans?: unknown;
    summary?: unknown;
    warnings?: unknown;
  };
  const chapters = Array.isArray(payload.chapters)
    ? payload.chapters.map(parseChapter).filter((chapter): chapter is AiBookPlanChapter => Boolean(chapter))
    : [];
  const spreadPlans = Array.isArray(payload.spreadPlans)
    ? payload.spreadPlans.map(parseSpread).filter((spread): spread is AiBookPlanSpread => Boolean(spread))
    : [];

  if (!spreadPlans.length) {
    throw new Error("AI book plan did not include any usable spreads.");
  }

  return {
    chapters,
    designScore:
      typeof payload.designScore === "number" && Number.isFinite(payload.designScore)
        ? Math.max(0, Math.min(100, payload.designScore))
        : 0,
    spreadPlans,
    summary: typeof payload.summary === "string" ? payload.summary : "",
    warnings: asStringArray(payload.warnings),
  };
}

function getCompatibleTemplates(
  project: Project,
  spread: AiBookPlanSpread,
  photoCount: number,
) {
  const packTemplates = getTemplatesForPack(project.draftEditorState?.templatePackId);
  const templates = packTemplates.length ? packTemplates : SPREAD_TEMPLATES;

  return templates.filter((template) => {
    const cappedMax = Math.min(template.maxPhotos, MAX_AI_PHOTOS_PER_SPREAD);
    return photoCount >= template.minPhotos && photoCount <= cappedMax;
  });
}

function chooseTemplate(
  project: Project,
  spread: AiBookPlanSpread,
  photoCount: number,
  index: number,
) {
  const requestedTemplate = getSpreadTemplate(spread.templateId);
  const requestedMax = requestedTemplate
    ? Math.min(requestedTemplate.maxPhotos, MAX_AI_PHOTOS_PER_SPREAD)
    : 0;

  if (
    requestedTemplate &&
    photoCount >= requestedTemplate.minPhotos &&
    photoCount <= requestedMax
  ) {
    return requestedTemplate;
  }

  const compatibleTemplates = getCompatibleTemplates(project, spread, photoCount);
  const matchingRhythm = compatibleTemplates.find((template) =>
    template.rhythmRole === spread.storyBeat ||
    template.layoutStyle === requestedTemplate?.layoutStyle,
  );
  return (
    matchingRhythm ??
    compatibleTemplates[index % Math.max(compatibleTemplates.length, 1)] ??
    getTemplatesForPack(project.draftEditorState?.templatePackId)[0] ??
    SPREAD_TEMPLATES[0]
  );
}

function getFallbackTitle(project: Project, spread: AiBookPlanSpread, index: number) {
  const place = getProjectPlace(project);
  const beatTitle: Record<BookPageStoryBeat, string> = {
    closing: `What ${place} Leaves Behind`,
    details: "Details Worth Saving",
    highlight: "A Frame Worth Holding",
    opener: `${place} Opens Here`,
    reflection: "A Quiet Pause",
    scene_setter: "Setting The Scene",
  };

  return `${beatTitle[spread.storyBeat]} ${index > 0 ? index + 1 : ""}`.trim();
}

function getFallbackCaption(project: Project, photos: PhotoAsset[], spread: AiBookPlanSpread) {
  const location = normalizeDisplayPlace(
    photos.map((photo) => photo.locationLabel).find(Boolean)?.replace(/,.*$/, "") ??
      getProjectPlace(project),
  );
  const subjects = formatSubjectList(photos);

  if (spread.storyBeat === "opener") {
    return `${subjects} opens ${location} with a clear sense of arrival and room for the trip to begin.`;
  }

  if (spread.storyBeat === "scene_setter") {
    return `${subjects} set the first rhythm: color, distance, and the small cues that make the place feel immediate.`;
  }

  if (spread.storyBeat === "details") {
    return `Small scenes from ${location}, ${subjects}, bring texture to the trip without pulling attention away from the photographs.`;
  }

  if (spread.storyBeat === "reflection") {
    return `${subjects} slows the book down for a quieter pause, holding onto the feeling of ${location}.`;
  }

  if (spread.storyBeat === "closing") {
    return `${subjects} closes the story softly, leaving ${location} as a place worth returning to on the page.`;
  }

  return `${subjects} gets the full frame here, simple and confident, with the image doing most of the talking.`;
}

function findPreservedPage(
  project: Project,
  spread: AiBookPlanSpread,
  photoIds: string[],
) {
  const lockedPageIds = new Set(project.draftEditorState?.lockedPageIds ?? []);
  const targetSignatures = new Set([
    getPageSignature(photoIds, spread.storyBeat),
    getPageSignature(photoIds),
  ]);

  return project.bookDraft.pages.find((page) => {
    const pageSignatures = [
      getPageSignature(page.photoIds, page.storyBeat),
      getPageSignature(page.photoIds),
    ];
    const matches = pageSignatures.some((signature) => targetSignatures.has(signature));

    return (
      matches &&
      (lockedPageIds.has(page.id) ||
        page.copySource === "manual" ||
        page.copyStatus === "confirmed")
    );
  });
}

function buildPageFromSpread(
  project: Project,
  spread: AiBookPlanSpread,
  template: SpreadTemplate,
  photoIds: string[],
  index: number,
): BookPage {
  const photos = photoIds
    .map((photoId) => project.photos.find((photo) => photo.id === photoId))
    .filter((photo): photo is PhotoAsset => Boolean(photo));

  return {
    approved: false,
    caption: normalizeCopy(spread.caption, getFallbackCaption(project, photos, spread)),
    copySource: "hybrid",
    copyStatus: "prefilled",
    curationNote: normalizeCopy(
      spread.rationale,
      "AI selected this spread from the approved template library, then the validator checked density, duplicate use, and print-safe behavior.",
    ),
    cropIntents: spread.cropIntents,
    id: `ai-${spread.id || createId("spread")}`,
    layoutNote: `Template ${template.name}. Photo roles: ${
      spread.photoRoles.length
        ? spread.photoRoles.map((role) => `${role.photoId}:${role.role}`).join(", ")
        : "AI default hierarchy"
    }. Crop intent: ${
      spread.cropIntents.length
        ? spread.cropIntents.map((crop) => `${crop.photoId}:${crop.region}`).join(", ")
        : "safe center"
    }.`,
    layoutVariation: template.layoutVariation,
    photoIds,
    photoRoles: spread.photoRoles,
    storyBeat: spread.storyBeat,
    style: template.layoutStyle,
    templateId: template.id,
    title: normalizeCopy(spread.title, getFallbackTitle(project, spread, index)),
  };
}

function getUnusedApprovedPhotos(project: Project, usedPhotoIds: Set<string>) {
  const sortedPhotos = [...project.photos]
    .filter((photo) => photo.approved && !usedPhotoIds.has(photo.id))
    .sort((left, right) => {
      if (left.mustInclude !== right.mustInclude) {
        return left.mustInclude ? -1 : 1;
      }

      const scoreDelta = getPhotoCurationScore(right) - getPhotoCurationScore(left);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return left.capturedAt.localeCompare(right.capturedAt);
    });

  const mustIncludePhotos = sortedPhotos.filter((photo) => photo.mustInclude);
  const regularPhotos = sortedPhotos.filter((photo) => !photo.mustInclude);

  return [
    ...interleavePhotosByDiversity(mustIncludePhotos),
    ...interleavePhotosByDiversity(regularPhotos),
  ];
}

function getGenerationTargets(approvedPhotoCount: number) {
  if (approvedPhotoCount >= 120) {
    return {
      maxPages: 32,
      minPages: 24,
      usageTarget: Math.min(
        Math.ceil(approvedPhotoCount * 0.45),
        approvedPhotoCount,
        32 * MAX_AI_PHOTOS_PER_SPREAD,
      ),
    };
  }

  if (approvedPhotoCount >= 80) {
    return {
      maxPages: 24,
      minPages: 18,
      usageTarget: Math.min(
        Math.ceil(approvedPhotoCount * 0.55),
        approvedPhotoCount,
        24 * MAX_AI_PHOTOS_PER_SPREAD,
      ),
    };
  }

  if (approvedPhotoCount >= 50) {
    return {
      maxPages: 12,
      minPages: 10,
      usageTarget: Math.min(
        Math.ceil(approvedPhotoCount * 0.35),
        approvedPhotoCount,
        12 * MAX_AI_PHOTOS_PER_SPREAD,
      ),
    };
  }

  if (approvedPhotoCount >= 26) {
    return {
      maxPages: 12,
      minPages: 10,
      usageTarget: Math.min(
        Math.ceil(approvedPhotoCount * 0.55),
        approvedPhotoCount,
        12 * MAX_AI_PHOTOS_PER_SPREAD,
      ),
    };
  }

  return {
    maxPages: 8,
    minPages: 6,
    usageTarget:
      approvedPhotoCount > 0
        ? Math.ceil(approvedPhotoCount * 0.85)
        : 0,
  };
}

function getRhythmBeat(index: number, pageCount: number): BookPageStoryBeat {
  if (pageCount > 2 && index === pageCount - 1) {
    return "closing";
  }

  return TRIP_STORY_RHYTHM[index % TRIP_STORY_RHYTHM.length] ?? "details";
}

function getPreferredTemplateIdForBeat(
  storyBeat: BookPageStoryBeat,
  photoCount: number,
  index: number,
) {
  if (storyBeat === "opener") {
    return photoCount <= 1 ? "full-bleed-1" : "hero-1";
  }

  if (storyBeat === "scene_setter") {
    return index % 2 === 0 ? "timeline-1" : "timeline-2";
  }

  if (storyBeat === "details") {
    return photoCount >= 4 ? (index % 4 === 3 ? "minimal-grid-2" : "minimal-grid-1") : "minimal-grid-2";
  }

  if (storyBeat === "reflection") {
    return photoCount <= 2 ? "caption-1" : "minimal-grid-2";
  }

  if (storyBeat === "closing") {
    return photoCount <= 2 ? "caption-2" : "minimal-grid-1";
  }

  return photoCount <= 1 ? "full-bleed-2" : "hero-1";
}

function isManualOrLockedPage(project: Project, page: BookPage) {
  const lockedPageIds = new Set(project.draftEditorState?.lockedPageIds ?? []);

  return (
    lockedPageIds.has(page.id) ||
    page.copySource === "manual" ||
    page.copyStatus === "confirmed"
  );
}

function getRhythmTitle(
  project: Project,
  storyBeat: BookPageStoryBeat,
  index: number,
  pageCount: number,
  photos: PhotoAsset[] = [],
) {
  const place = getProjectPlace(project);
  const cycle = Math.floor(index / TRIP_STORY_RHYTHM.length);
  const subjectText = photos.map(getPhotoSubject).join(" ").toLowerCase();

  if (storyBeat === "opener") {
    return cycle > 0 ? `${place}, Again In Focus` : `${place} In Full Color`;
  }

  if (storyBeat === "scene_setter") {
    if (/\b(umbrella|umbrellas|flowers|garden|color)\b/.test(subjectText)) {
      return "Color First";
    }

    return cycle > 0 ? "Another Sense Of Place" : "First Views";
  }

  if (storyBeat === "details") {
    if (/\b(wine|blandys|guitar|music|funchal)\b/.test(subjectText)) {
      return "Wine, Music, And Green Corners";
    }

    if (/\b(lunch|restaurant|caraibas|food)\b/.test(subjectText)) {
      return "Lunch In The Shade";
    }

    return cycle > 0 ? "More Details, More Feeling" : "Small Scenes, Big Feeling";
  }

  if (storyBeat === "reflection") {
    if (/\b(pano|panorama|mountain|valley|view)\b/.test(subjectText)) {
      return "A Softer View";
    }

    return cycle > 0 ? "A Softer Kind Of Beautiful" : "A Quiet Kind Of Beautiful";
  }

  if (storyBeat === "closing" || index === pageCount - 1) {
    return `What ${place} Leaves Behind`;
  }

  if (/\b(bay|harbour|harbor|lobos|boats|water)\b/.test(subjectText)) {
    return index > 4 ? "Garden Light" : "The Blue Harbor";
  }

  if (/\b(palm|garden|flowers|funchal)\b/.test(subjectText)) {
    return "Garden Light";
  }

  return cycle > 0 ? "One More View To Keep" : "The View That Stays";
}

function getRhythmCaption(
  project: Project,
  storyBeat: BookPageStoryBeat,
  index: number,
  pageCount: number,
  photos: PhotoAsset[],
) {
  const place = getProjectPlace(project);
  const subjects = formatSubjectList(photos);
  const cycle = Math.floor(index / TRIP_STORY_RHYTHM.length);

  if (storyBeat === "opener") {
    return `First glimpse of ${place}: blue water, open sky, and the feeling of arrival.`;
  }

  if (storyBeat === "scene_setter") {
    return cycle > 0
      ? `Another sense of place keeps the route moving without crowding the page.`
      : `Color and garden light set the first bright chapter.`;
  }

  if (storyBeat === "details") {
    if (/\b(wine|blandys|guitar|music|funchal)\b/i.test(subjects)) {
      return `Music, wine, and garden corners give this chapter texture.`;
    }

    if (/\b(lunch|restaurant|caraibas|food)\b/i.test(subjects)) {
      return `Lunch, shade, and small pauses keep the middle of the story human.`;
    }

    return `Small scenes and textures make the trip feel lived in.`;
  }

  if (storyBeat === "reflection") {
    return `A quieter page for the landscape to speak.`;
  }

  if (storyBeat === "closing" || index === pageCount - 1) {
    return `A final view worth returning to.`;
  }

  if (/\b(garden|palm|flowers|funchal)\b/i.test(subjects)) {
    return `A full-page pause for color, shape, and garden light.`;
  }

  return `One confident frame, enough space, and no extra clutter.`;
}

function shouldRefreshPageCopyForRhythm(page: BookPage) {
  return (
    page.copySource !== "manual" &&
    page.copyStatus !== "confirmed" &&
    /\b(?:comes through in the details|slows down here|slows the book down|visual anchor|supporting frames|carries this spread|opens the book|trip-story fallback|opens with one clean frame|room to breathe|story closes softly|closes the story softly|gets the full frame|gets the full frame here|clear sense of arrival|set the first rhythm|small scenes from|bring texture to the trip|clear first impression|first burst of color|lived-in texture|slows the pace|stands alone here|closes the sequence quietly)\b/i.test(
      page.caption,
    )
  );
}

function applyEditorialTripRhythm(project: Project, pages: BookPage[]) {
  if (project.type !== "trip" || pages.length <= 1) {
    return pages;
  }

  return pages.map((page, index) => {
    if (isManualOrLockedPage(project, page)) {
      return page;
    }

    const storyBeat = getRhythmBeat(index, pages.length);
    const templateId = getPreferredTemplateIdForBeat(storyBeat, page.photoIds.length, index);
    const photos = page.photoIds
      .map((photoId) => project.photos.find((photo) => photo.id === photoId))
      .filter((photo): photo is PhotoAsset => Boolean(photo));
    const rhythmSpread: AiBookPlanSpread = {
      caption: page.caption,
      cropIntents: [],
      id: page.id,
      photoIds: page.photoIds,
      photoRoles: page.photoIds.map((photoId, photoIndex) => ({
        photoId,
        role:
          photoIndex === 0
            ? storyBeat === "details"
              ? "detail"
              : "hero"
            : storyBeat === "details"
              ? "texture"
              : "support",
      })),
      rationale: page.curationNote,
      storyBeat,
      templateId,
      title: page.title,
    };
    const template = chooseTemplate(
      project,
      rhythmSpread,
      page.photoIds.length,
      index,
    );

    return {
      ...page,
      caption: shouldRefreshPageCopyForRhythm(page)
        ? getRhythmCaption(project, storyBeat, index, pages.length, photos)
        : page.caption,
      curationNote:
        page.curationNote && !/\bvalidator\b/i.test(page.curationNote)
          ? page.curationNote
          : "Placed into the editorial trip-story rhythm so the book alternates scene, hero, details, and quiet reflection pages.",
      cropIntents: rhythmSpread.cropIntents,
      layoutNote: `${page.layoutNote ?? ""} Editorial rhythm selected ${template.name}.`.trim(),
      layoutVariation: template.layoutVariation,
      storyBeat,
      style: template.layoutStyle,
      photoRoles: rhythmSpread.photoRoles,
      templateId: template.id,
      title: getRhythmTitle(project, storyBeat, index, pages.length, photos),
    };
  });
}

function buildMustIncludePage(
  project: Project,
  photos: PhotoAsset[],
  index: number,
  input?: {
    curationNote?: string;
    idPrefix?: string;
    rationale?: string;
    storyBeat?: BookPageStoryBeat;
    templateId?: string;
    title?: string;
  },
): BookPage {
  const storyBeat = input?.storyBeat ?? "highlight";
  const template = chooseTemplate(
    project,
    {
      caption: "",
      cropIntents: [],
      id: `${input?.idPrefix ?? "must-include"}-${index}`,
      photoIds: photos.map((photo) => photo.id),
      photoRoles: photos.map((photo, photoIndex) => ({
        photoId: photo.id,
        role: photoIndex === 0 ? "hero" : "support",
      })),
      rationale:
        input?.rationale ??
        "Validator added this spread because a must-include photo was missing from the AI plan.",
      storyBeat,
      templateId: input?.templateId ?? "hero-1",
      title: "",
    },
    photos.length,
    index,
  );

  return {
    approved: false,
    caption: getFallbackCaption(project, photos, {
      caption: "",
      cropIntents: [],
      id: "must-include",
      photoIds: photos.map((photo) => photo.id),
      photoRoles: [],
      rationale: "",
      storyBeat,
      templateId: template.id,
      title: "",
    }),
    copySource: "hybrid",
    copyStatus: "prefilled",
    curationNote:
      input?.curationNote ??
      "Added by the deterministic repair step so every must-include photo appears exactly once.",
    cropIntents: photos.map((photo) => ({
      photoId: photo.id,
      region: "center",
    })),
    id: `ai-${input?.idPrefix ?? "must-include"}-${photos.map((photo) => photo.id).join("-")}`,
    layoutNote: `Template ${template.name}. ${
      input?.idPrefix === "usage-target"
        ? "Usage-target validator spread."
        : "Must-include validator spread."
    }`,
    layoutVariation: template.layoutVariation,
    photoIds: photos.map((photo) => photo.id),
    photoRoles: photos.map((photo, photoIndex) => ({
      photoId: photo.id,
      role: photoIndex === 0 ? "hero" : "support",
    })),
    storyBeat,
    style: template.layoutStyle,
    templateId: template.id,
    title:
      input?.title ??
      `${photos[0]?.locationLabel ?? project.title} needed its own moment`,
  };
}

export function materializeAiBookPlan(
  project: Project,
  plan: AiBookPlan,
  input?: {
    questionnaire?: Partial<BookGenerationQuestionnaireAnswers>;
    run?: GenerationRun;
  },
): Project {
  const normalizedProject = normalizeProjectDraftState(project);
  const validPhotoIds = new Set(
    normalizedProject.photos.filter((photo) => photo.approved).map((photo) => photo.id),
  );
  const generationTargets = getGenerationTargets(validPhotoIds.size);
  const photoUsageTarget = generationTargets.usageTarget;
  const usedPhotoIds = new Set<string>();
  const pages: BookPage[] = [];

  for (const [index, spread] of plan.spreadPlans.entries()) {
    const photoIds = uniqueStrings(spread.photoIds)
      .filter((photoId) => validPhotoIds.has(photoId))
      .filter((photoId) => !usedPhotoIds.has(photoId))
      .slice(0, MAX_AI_PHOTOS_PER_SPREAD);

    if (!photoIds.length) {
      continue;
    }

    const preservedPage = findPreservedPage(normalizedProject, spread, photoIds);
    if (preservedPage) {
      pages.push(cloneValue(preservedPage));
      preservedPage.photoIds.forEach((photoId) => usedPhotoIds.add(photoId));
      continue;
    }

    const template = chooseTemplate(normalizedProject, spread, photoIds.length, index);
    pages.push(buildPageFromSpread(normalizedProject, spread, template, photoIds, index));
    photoIds.forEach((photoId) => usedPhotoIds.add(photoId));
  }

  const missingMustIncludePhotos = getUnusedApprovedPhotos(normalizedProject, usedPhotoIds).filter(
    (photo) => photo.mustInclude,
  );
  for (let index = 0; index < missingMustIncludePhotos.length; index += 2) {
    const chunk = missingMustIncludePhotos.slice(index, index + 2);
    pages.push(buildMustIncludePage(normalizedProject, chunk, pages.length));
    chunk.forEach((photo) => usedPhotoIds.add(photo.id));
  }

  const fallbackPhotos = getUnusedApprovedPhotos(normalizedProject, usedPhotoIds);
  while (pages.length < generationTargets.minPages && fallbackPhotos.length) {
    const chunkSize = validPhotoIds.size >= 26 ? 3 : 2;
    const chunk = fallbackPhotos.splice(0, chunkSize).filter(Boolean);
    if (!chunk.length) {
      break;
    }
    pages.push(buildMustIncludePage(normalizedProject, chunk, pages.length));
    chunk.forEach((photo) => usedPhotoIds.add(photo.id));
  }

  while (
    photoUsageTarget > 0 &&
    usedPhotoIds.size < photoUsageTarget &&
    pages.length < generationTargets.maxPages &&
    fallbackPhotos.length
  ) {
    const remainingToTarget = photoUsageTarget - usedPhotoIds.size;
    const chunkSize = Math.min(
      MAX_AI_PHOTOS_PER_SPREAD,
      fallbackPhotos.length,
      Math.max(2, remainingToTarget),
    );
    const chunk = fallbackPhotos.splice(0, chunkSize).filter(Boolean);
    const storyBeat: BookPageStoryBeat = pages.length % 2 === 0 ? "details" : "reflection";

    if (!chunk.length) {
      break;
    }

    pages.push(
      buildMustIncludePage(normalizedProject, chunk, pages.length, {
        curationNote:
          "Added by the deterministic repair step so small-batch generations use enough approved trip photos.",
        idPrefix: "usage-target",
        rationale:
          "Validator filled this spread to meet the small-batch approved-photo usage target.",
        storyBeat,
        templateId: storyBeat === "details" ? "minimal-grid-1" : "caption-1",
        title: `${chunk[0]?.locationLabel ?? normalizedProject.title} in the in-between moments`,
      }),
    );
    chunk.forEach((photo) => usedPhotoIds.add(photo.id));
  }

  let repairedPages = pages.slice(0, generationTargets.maxPages);
  let repairedUsedPhotoIds = new Set(repairedPages.flatMap((page) => page.photoIds));

  if (photoUsageTarget > 0 && repairedUsedPhotoIds.size < photoUsageTarget) {
    const unusedPhotos = getUnusedApprovedPhotos(normalizedProject, repairedUsedPhotoIds);
    repairedPages = repairedPages.map((page, index) => {
      const remainingTarget = photoUsageTarget - repairedUsedPhotoIds.size;
      const availableSlots = MAX_AI_PHOTOS_PER_SPREAD - page.photoIds.length;
      const shouldPreserveOpener = page.storyBeat === "opener" && repairedPages.length > 1;
      const addedPhotos = shouldPreserveOpener
        ? []
        : unusedPhotos.splice(0, Math.min(availableSlots, remainingTarget, unusedPhotos.length));

      if (!addedPhotos.length) {
        return page;
      }

      const photoIds = [...page.photoIds, ...addedPhotos.map((photo) => photo.id)];
      const template = chooseTemplate(
        normalizedProject,
        {
          caption: page.caption,
          cropIntents: [],
          id: page.id,
          photoIds,
          photoRoles: photoIds.map((photoId, photoIndex) => ({
            photoId,
            role: photoIndex === 0 ? "hero" : "support",
          })),
          rationale: page.curationNote,
          storyBeat: page.storyBeat,
          templateId: page.templateId ?? "minimal-grid-1",
          title: page.title,
        },
        photoIds.length,
        index,
      );

      addedPhotos.forEach((photo) => repairedUsedPhotoIds.add(photo.id));

      return {
        ...page,
        layoutNote: `${page.layoutNote ?? ""} Validator added ${addedPhotos.length} approved photo(s) to meet small-batch coverage.`.trim(),
        layoutVariation: template.layoutVariation,
        photoIds,
        style: template.layoutStyle,
        templateId: template.id,
      };
    });
  }

  const hasDetailGrid = repairedPages.some((page) =>
    page.storyBeat === "details" || /grid/.test(page.templateId ?? ""),
  );
  if (!hasDetailGrid) {
    const detailIndex = repairedPages.findIndex(
      (page) => page.storyBeat !== "opener" && page.photoIds.length > 0,
    );
    if (detailIndex >= 0) {
      const page = repairedPages[detailIndex]!;
      const template = chooseTemplate(
        normalizedProject,
        {
          caption: page.caption,
          cropIntents: [],
          id: page.id,
          photoIds: page.photoIds,
          photoRoles: page.photoIds.map((photoId, photoIndex) => ({
            photoId,
            role: photoIndex === 0 ? "hero" : "detail",
          })),
          rationale: page.curationNote,
          storyBeat: "details",
          templateId: "minimal-grid-1",
          title: page.title,
        },
        page.photoIds.length,
        detailIndex,
      );
      repairedPages = repairedPages.map((candidate, index) =>
        index === detailIndex
          ? {
              ...candidate,
              curationNote: `${candidate.curationNote} Validator mapped this spread into the detail/grid rhythm the book was missing.`,
              layoutNote: `${candidate.layoutNote ?? ""} Validator selected ${template.name} to restore detail/grid pacing.`.trim(),
              layoutVariation: template.layoutVariation,
              storyBeat: "details",
              style: template.layoutStyle,
              templateId: template.id,
            }
          : candidate,
      );
    }
  }

  repairedPages = applyEditorialTripRhythm(normalizedProject, repairedPages);

  repairedUsedPhotoIds = new Set(repairedPages.flatMap((page) => page.photoIds));
  const summaryBase = normalizeCopy(
    plan.summary,
    `AI generated a print-ready draft for ${normalizedProject.title}.`,
  )
    .replace(/\b\d+\s+spreads?\b/gi, `${repairedPages.length} spreads`)
    .replace(/\b\d+\s+approved photos?\b/gi, `${repairedUsedPhotoIds.size} approved photos`);
  const summary = `${summaryBase} Validator saved ${repairedPages.length} spreads using ${repairedUsedPhotoIds.size} approved photos. Design score ${Math.round(plan.designScore)}.`;
  const questionnaire = input?.questionnaire;
  const nextFormatId = questionnaire?.bookSize ?? normalizedProject.draftEditorState!.formatId;
  const detailPreferences = getQuestionnaireDetailPreferences(
    questionnaire?.mapMemorabiliaPreference,
  );
  const nextDensity =
    getEditorDensityFromGenerationDensity(questionnaire?.density) ??
    normalizedProject.draftEditorState!.density;
  const run = input?.run
    ? {
        ...input.run,
        completedAt: input.run.completedAt ?? nowIso(),
        progress: uniqueStrings([...input.run.progress, "draft saved"]),
        status: "saved" as const,
        validationWarnings: uniqueStrings([
          ...input.run.validationWarnings,
          ...plan.warnings,
        ]),
      }
    : undefined;

  return saveWorkingDraft(
    {
      ...normalizedProject,
      generationQuestionnaire: {
        ...(normalizedProject.generationQuestionnaire ?? {}),
        ...(input?.questionnaire ?? {}),
      },
      generationRuns: run
        ? [run, ...(normalizedProject.generationRuns ?? [])].slice(0, 20)
        : normalizedProject.generationRuns,
    },
    {
      bookDraft: {
        ...normalizedProject.bookDraft,
        format: getBookDraftFormatLabel(nextFormatId),
        id: normalizedProject.bookDraft.id,
        pages: repairedPages,
        status: "reviewing",
        summary,
      },
      draftEditorState: {
        ...normalizedProject.draftEditorState!,
        aiProvider: "ollama",
        captionTone: questionnaire?.tone ?? normalizedProject.draftEditorState!.captionTone,
        density: nextDensity,
        formatId: nextFormatId,
        lastAiRefreshAt: nowIso(),
        showMaps: detailPreferences.showMaps || normalizedProject.draftEditorState!.showMaps,
        showMemorabilia:
          detailPreferences.showMemorabilia || normalizedProject.draftEditorState!.showMemorabilia,
      },
    },
  );
}

export function createGenerationRun(input?: {
  fallbackPlanner?: string;
  id?: string;
  planner?: string;
  progress?: string[];
  status?: GenerationRun["status"];
  validationWarnings?: string[];
  vision?: string;
}): GenerationRun {
  return {
    id: input?.id ?? createId("generation-run"),
    modelNames: {
      fallbackPlanner: input?.fallbackPlanner ?? FALLBACK_PLANNER_MODEL,
      planner: input?.planner ?? DEFAULT_PLANNER_MODEL,
      vision: input?.vision ?? DEFAULT_VISION_MODEL,
    },
    progress: input?.progress ?? [],
    startedAt: nowIso(),
    status: input?.status ?? "queued",
    validationWarnings: input?.validationWarnings ?? [],
  };
}

export function getAiTemplateCatalogForPrompt() {
  const preferredTemplateIds = new Set([
    "full-bleed-1",
    "full-bleed-2",
    "hero-1",
    "hero-2",
    "minimal-grid-1",
    "minimal-grid-2",
    "collage-1",
    "collage-2",
    "family-recap-1",
    "family-recap-2",
    "caption-1",
    "caption-2",
    "timeline-1",
    "timeline-2",
    "couple-story-1",
    "couple-story-2",
  ]);
  const spreadTemplates = SPREAD_TEMPLATES.filter((template) =>
    preferredTemplateIds.has(template.id),
  );

  return {
    bookTemplatePacks: BOOK_TEMPLATE_PACKS.map((packEntry) => ({
      category: packEntry.category,
      description: packEntry.description,
      id: packEntry.id,
      name: packEntry.name,
      spreadTemplateIds: packEntry.spreadTemplateIds.filter((templateId) =>
        preferredTemplateIds.has(templateId),
      ),
      tags: packEntry.tags,
    })),
    spreadTemplates: spreadTemplates.map((template) => ({
      allowedPhotoRoles: template.allowedPhotoRoles,
      cropSlotBehavior: template.cropSlotBehavior,
      id: template.id,
      idealPhotoCount: template.idealPhotoCount,
      layoutStyle: template.layoutStyle,
      maxPhotos: Math.min(template.maxPhotos, MAX_AI_PHOTOS_PER_SPREAD),
      minPhotos: template.minPhotos,
      name: template.name,
      rhythmRole: template.rhythmRole,
      safeAreaBehavior: template.safeAreaBehavior,
      tags: template.tags.slice(0, 6),
      visualDensity: template.visualDensity,
    })),
  };
}
