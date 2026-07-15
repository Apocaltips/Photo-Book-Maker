import type {
  BookCaptionTone,
  BookDraftFormatId,
  BookStyleMode,
  BookStoryMode,
  BookTemplatePack,
  PageLayoutStyle,
  SpreadTemplate,
  TemplateCategory,
} from "./types";

const spreadFamilies: Array<{
  id: string;
  category: TemplateCategory;
  description: string;
  layoutStyle: PageLayoutStyle;
  maxPhotos: number;
  minPhotos: number;
  name: string;
  tags: string[];
}> = [
  {
    id: "minimal-grid",
    name: "Minimal Grid",
    category: "minimal",
    description: "Disciplined image grids for clean, premium pacing.",
    layoutStyle: "minimal_grid",
    minPhotos: 1,
    maxPhotos: 4,
    tags: ["balanced", "gallery", "quiet"],
  },
  {
    id: "hero",
    name: "Hero Moment",
    category: "premium",
    description: "One lead image supported by compact context.",
    layoutStyle: "hero",
    minPhotos: 1,
    maxPhotos: 4,
    tags: ["hero", "feature", "cover"],
  },
  {
    id: "collage",
    name: "Collected Collage",
    category: "travel",
    description: "Dense but intentional pages for candid runs and memory texture.",
    layoutStyle: "collage",
    minPhotos: 4,
    maxPhotos: 8,
    tags: ["dense", "candid", "energy"],
  },
  {
    id: "couple-story",
    name: "Couple Story",
    category: "couples",
    description: "Relationship-forward spreads with stronger narrative space.",
    layoutStyle: "couple_story",
    minPhotos: 1,
    maxPhotos: 3,
    tags: ["couple", "romantic", "journal"],
  },
  {
    id: "family-recap",
    name: "Family Recap",
    category: "family",
    description: "Grouped event pages with one clear lead and supporting moments.",
    layoutStyle: "family_recap",
    minPhotos: 3,
    maxPhotos: 6,
    tags: ["family", "recap", "event"],
  },
  {
    id: "timeline",
    name: "Route Timeline",
    category: "travel",
    description: "Sequential travel pages with light chronology cues.",
    layoutStyle: "timeline",
    minPhotos: 1,
    maxPhotos: 4,
    tags: ["route", "timeline", "day"],
  },
  {
    id: "full-bleed",
    name: "Full Bleed Feature",
    category: "premium",
    description: "A single image gets room to become the whole spread.",
    layoutStyle: "full_bleed",
    minPhotos: 1,
    maxPhotos: 3,
    tags: ["panorama", "dramatic", "premium"],
  },
  {
    id: "panorama",
    name: "Panorama Story",
    category: "premium",
    description: "Wide scenic pages for resort, overlook, skyline, and landscape moments.",
    layoutStyle: "panorama_spread",
    minPhotos: 1,
    maxPhotos: 3,
    tags: ["panorama", "landscape", "scenic"],
  },
  {
    id: "caption",
    name: "Caption Feature",
    category: "yearbook",
    description: "Image-first pages that preserve a deliberate written memory.",
    layoutStyle: "caption",
    minPhotos: 1,
    maxPhotos: 2,
    tags: ["caption", "copy", "reflection"],
  },
  {
    id: "photo-journal",
    name: "Photo Journal",
    category: "minimal",
    description: "Editorial image-and-copy pages for notes, context, and quieter memories.",
    layoutStyle: "photo_journal",
    minPhotos: 1,
    maxPhotos: 3,
    tags: ["journal", "caption", "editorial"],
  },
  {
    id: "burst-sequence",
    name: "Burst Sequence",
    category: "family",
    description: "Fast multi-frame spreads for action, candids, arrivals, and playful sequences.",
    layoutStyle: "burst_sequence",
    minPhotos: 4,
    maxPhotos: 8,
    tags: ["sequence", "action", "candid"],
  },
];

const variationNames = [
  "Classic",
  "Airy",
  "Offset",
  "Stacked",
  "Magazine",
  "Quiet",
  "Gallery",
  "Statement",
] as const;

function getIdealPhotoCount(layoutStyle: PageLayoutStyle) {
  const idealCounts: Record<PageLayoutStyle, number> = {
    balanced: 2,
    balanced_two_up: 2,
    burst_sequence: 5,
    caption: 1,
    chapter: 1,
    closing: 1,
    collage: 5,
    couple_story: 2,
    dense_candid_grid: 6,
    diptych: 2,
    family_recap: 4,
    four_up_grid: 4,
    full_bleed: 1,
    hero: 1,
    hero_full_bleed: 1,
    hero_support_strip: 3,
    map_timeline: 2,
    memorabilia_spread: 4,
    minimal_grid: 3,
    mosaic: 4,
    panorama_spread: 1,
    pattern_repetition: 4,
    photo_journal: 2,
    recap: 4,
    text_divider: 1,
    timeline: 2,
  };

  return idealCounts[layoutStyle] ?? 2;
}

function getTemplateMetadata(layoutStyle: PageLayoutStyle) {
  const isHero = ["full_bleed", "hero", "panorama_spread", "hero_full_bleed"].includes(layoutStyle);
  const isDense = ["burst_sequence", "collage", "family_recap", "dense_candid_grid", "mosaic", "memorabilia_spread"].includes(layoutStyle);
  const isQuiet = ["caption", "timeline", "chapter", "text_divider", "closing"].includes(layoutStyle);

  return {
    allowedPhotoRoles: isHero
      ? ["hero", "cover", "support"] as const
      : isDense
        ? ["detail", "texture", "support", "closing"] as const
        : ["hero", "support", "detail", "closing"] as const,
    cropSlotBehavior: isHero
      ? "full-bleed" as const
      : isDense
        ? "grid-crop" as const
        : isQuiet
          ? "no-crop" as const
          : "safe-center" as const,
    rhythmRole: isHero
      ? "hero" as const
      : isDense
        ? "detail" as const
        : isQuiet
          ? "divider" as const
          : "support" as const,
    safeAreaBehavior: isHero ? "bleed-aware" as const : "standard" as const,
    visualDensity: isDense ? "dense" as const : isQuiet ? "quiet" as const : "balanced" as const,
  };
}

export const SPREAD_TEMPLATES: SpreadTemplate[] = spreadFamilies.flatMap((family) =>
  variationNames.map((variationName, variationIndex) => {
    const metadata = getTemplateMetadata(family.layoutStyle);

    return {
      id: `${family.id}-${variationIndex + 1}`,
      name: `${family.name} ${variationName}`,
      category: family.category,
      description: family.description,
      layoutStyle: family.layoutStyle,
      layoutVariation: variationIndex,
      minPhotos: family.minPhotos,
      maxPhotos: family.maxPhotos,
      tags: [
        ...family.tags,
        variationName.toLowerCase(),
        "editorial travel",
        family.layoutStyle === "timeline" ? "arrival/departure" : "",
        family.layoutStyle === "full_bleed" ? "panorama hero" : "",
        family.layoutStyle === "panorama_spread" ? "wide scenic hero" : "",
        family.layoutStyle === "caption" ? "quiet caption" : "",
        family.layoutStyle === "photo_journal" ? "journal notes" : "",
        family.layoutStyle === "burst_sequence" ? "movement sequence" : "",
        family.layoutStyle === "family_recap" || family.layoutStyle === "collage"
          ? "food/detail grid"
          : "",
        family.category === "couples" ? "couple getaway" : "",
        family.category === "travel" ? "resort trip" : "",
      ].filter(Boolean),
      idealPhotoCount: getIdealPhotoCount(family.layoutStyle),
      allowedPhotoRoles: [...metadata.allowedPhotoRoles],
      cropSlotBehavior: metadata.cropSlotBehavior,
      rhythmRole: metadata.rhythmRole,
      safeAreaBehavior: metadata.safeAreaBehavior,
      visualDensity: metadata.visualDensity,
      bestUseCases: [
        family.description,
        family.layoutStyle === "full_bleed" || family.layoutStyle === "panorama_spread"
          ? "Resort, ocean, skyline, landscape, or panorama hero pages."
          : family.layoutStyle === "caption" || family.layoutStyle === "photo_journal"
            ? "Quiet reflection, closing, or copy-led memory pages."
            : family.layoutStyle === "family_recap" || family.layoutStyle === "collage" || family.layoutStyle === "burst_sequence"
              ? "Food, detail, candid, texture, and supporting memory groups."
              : "Balanced story spreads with clear hierarchy.",
      ],
      avoidWhen: [
        family.layoutStyle === "full_bleed" || family.layoutStyle === "panorama_spread"
          ? "Avoid with low-resolution, vertical, or cluttered images."
          : family.layoutStyle === "collage" || family.layoutStyle === "burst_sequence"
            ? "Avoid when the spread needs a single emotional focal point."
            : "Avoid if the photo count falls outside the template limits.",
      ],
    };
  }),
);

const spreadIds = (familyId: string) =>
  SPREAD_TEMPLATES.filter((template) => template.id.startsWith(`${familyId}-`)).map(
    (template) => template.id,
  );

function pack(input: {
  captionTone: BookCaptionTone;
  category: TemplateCategory;
  coverTemplateId: string;
  description: string;
  fontPresetId: string;
  formatId: BookDraftFormatId;
  id: string;
  name: string;
  previewAccent: string;
  spreadTemplateIds: string[];
  storyMode: BookStoryMode;
  styleMode: BookStyleMode;
  tags: string[];
  themeId: string;
}): BookTemplatePack {
  return input;
}

export const BOOK_TEMPLATE_PACKS: BookTemplatePack[] = [
  pack({
    id: "trip-editorial-atlas",
    name: "Editorial Atlas",
    category: "travel",
    description: "A premium route-led travel book with cinematic hero resets.",
    formatId: "12x12-square",
    styleMode: "minimal_editorial",
    fontPresetId: "gallery",
    captionTone: "warm",
    storyMode: "route_story",
    themeId: "golden-hour",
    coverTemplateId: "full-bleed-1",
    spreadTemplateIds: [...spreadIds("full-bleed"), ...spreadIds("timeline"), ...spreadIds("minimal-grid")],
    tags: ["travel", "route", "premium"],
    previewAccent: "#c76c3a",
  }),
  pack({
    id: "coastal-lookbook",
    name: "Coastal Lookbook",
    category: "travel",
    description: "Soft blues, open margins, and calm scenic sequencing.",
    formatId: "11x8.5-landscape",
    styleMode: "clean_modern",
    fontPresetId: "expedition",
    captionTone: "factual",
    storyMode: "location_clusters",
    themeId: "coastline",
    coverTemplateId: "hero-2",
    spreadTemplateIds: [...spreadIds("hero"), ...spreadIds("minimal-grid"), ...spreadIds("caption")],
    tags: ["coast", "landscape", "modern"],
    previewAccent: "#6a7ea8",
  }),
  pack({
    id: "weekend-film-roll",
    name: "Weekend Film Roll",
    category: "travel",
    description: "High-energy grids for quick trips, candids, food, and details.",
    formatId: "10x10-square",
    styleMode: "bold_travel",
    fontPresetId: "poster",
    captionTone: "playful",
    storyMode: "day_by_day",
    themeId: "golden-hour",
    coverTemplateId: "collage-5",
    spreadTemplateIds: [...spreadIds("collage"), ...spreadIds("family-recap"), ...spreadIds("timeline")],
    tags: ["weekend", "candid", "energetic"],
    previewAccent: "#c76c3a",
  }),
  pack({
    id: "national-park-journal",
    name: "National Park Journal",
    category: "travel",
    description: "Outdoor texture, route context, and spacious scenic pages.",
    formatId: "12x12-square",
    styleMode: "bold_travel",
    fontPresetId: "outdoors",
    captionTone: "reflective",
    storyMode: "route_story",
    themeId: "pine-ink",
    coverTemplateId: "full-bleed-3",
    spreadTemplateIds: [...spreadIds("timeline"), ...spreadIds("full-bleed"), ...spreadIds("caption")],
    tags: ["outdoors", "parks", "journal"],
    previewAccent: "#335c52",
  }),
  pack({
    id: "resort-panorama-luxe",
    name: "Resort Panorama Luxe",
    category: "premium",
    description: "Wide cinematic scenic pages mixed with polished editorial context.",
    formatId: "11x8.5-landscape",
    styleMode: "minimal_editorial",
    fontPresetId: "continental",
    captionTone: "reflective",
    storyMode: "location_clusters",
    themeId: "coastline",
    coverTemplateId: "panorama-1",
    spreadTemplateIds: [...spreadIds("panorama"), ...spreadIds("full-bleed"), ...spreadIds("photo-journal")],
    tags: ["resort", "panorama", "premium"],
    previewAccent: "#6a7ea8",
  }),
  pack({
    id: "action-weekend-burst",
    name: "Action Weekend Burst",
    category: "travel",
    description: "Fast-paced sequences for active trips, arrivals, candids, and quick story beats.",
    formatId: "10x10-square",
    styleMode: "bold_travel",
    fontPresetId: "poster",
    captionTone: "playful",
    storyMode: "day_by_day",
    themeId: "golden-hour",
    coverTemplateId: "burst-sequence-1",
    spreadTemplateIds: [...spreadIds("burst-sequence"), ...spreadIds("collage"), ...spreadIds("timeline")],
    tags: ["action", "weekend", "candid"],
    previewAccent: "#c76c3a",
  }),
  pack({
    id: "couples-keepsake",
    name: "Couples Keepsake",
    category: "couples",
    description: "Warm romantic pacing for trips, anniversaries, and shared memories.",
    formatId: "10x10-square",
    styleMode: "warm_scrapbook",
    fontPresetId: "romantic",
    captionTone: "warm",
    storyMode: "theme_clusters",
    themeId: "golden-hour",
    coverTemplateId: "couple-story-1",
    spreadTemplateIds: [...spreadIds("couple-story"), ...spreadIds("caption"), ...spreadIds("minimal-grid")],
    tags: ["couple", "anniversary", "warm"],
    previewAccent: "#c76c3a",
  }),
  pack({
    id: "honeymoon-editorial",
    name: "Honeymoon Editorial",
    category: "couples",
    description: "A polished romantic lookbook with large features and quiet copy.",
    formatId: "12x12-square",
    styleMode: "minimal_editorial",
    fontPresetId: "couture",
    captionTone: "reflective",
    storyMode: "location_clusters",
    themeId: "coastline",
    coverTemplateId: "full-bleed-6",
    spreadTemplateIds: [...spreadIds("full-bleed"), ...spreadIds("couple-story"), ...spreadIds("hero")],
    tags: ["romantic", "premium", "travel"],
    previewAccent: "#6a7ea8",
  }),
  pack({
    id: "family-adventure",
    name: "Family Adventure",
    category: "family",
    description: "Event-friendly pages with more faces, moments, and recap rhythm.",
    formatId: "10x10-square",
    styleMode: "warm_scrapbook",
    fontPresetId: "field",
    captionTone: "playful",
    storyMode: "day_by_day",
    themeId: "pine-ink",
    coverTemplateId: "family-recap-3",
    spreadTemplateIds: [...spreadIds("family-recap"), ...spreadIds("collage"), ...spreadIds("caption")],
    tags: ["family", "kids", "recap"],
    previewAccent: "#335c52",
  }),
  pack({
    id: "holiday-table-book",
    name: "Holiday Table Book",
    category: "family",
    description: "Warm annual or event recaps with food, details, and family pages.",
    formatId: "8x8-square",
    styleMode: "warm_scrapbook",
    fontPresetId: "artisan",
    captionTone: "warm",
    storyMode: "theme_clusters",
    themeId: "golden-hour",
    coverTemplateId: "caption-4",
    spreadTemplateIds: [...spreadIds("caption"), ...spreadIds("family-recap"), ...spreadIds("minimal-grid")],
    tags: ["holiday", "food", "family"],
    previewAccent: "#c76c3a",
  }),
  pack({
    id: "family-motion-recap",
    name: "Family Motion Recap",
    category: "family",
    description: "A lively family book with action sequences, recap pages, and warm journal moments.",
    formatId: "10x10-square",
    styleMode: "warm_scrapbook",
    fontPresetId: "field",
    captionTone: "playful",
    storyMode: "theme_clusters",
    themeId: "pine-ink",
    coverTemplateId: "burst-sequence-3",
    spreadTemplateIds: [...spreadIds("burst-sequence"), ...spreadIds("family-recap"), ...spreadIds("photo-journal")],
    tags: ["family", "movement", "recap"],
    previewAccent: "#335c52",
  }),
  pack({
    id: "annual-classic",
    name: "Annual Classic",
    category: "yearbook",
    description: "A timeless yearbook with monthly pacing and confident typography.",
    formatId: "12x12-square",
    styleMode: "timeless_yearbook",
    fontPresetId: "novel",
    captionTone: "warm",
    storyMode: "month_by_month",
    themeId: "coastline",
    coverTemplateId: "hero-6",
    spreadTemplateIds: [...spreadIds("caption"), ...spreadIds("minimal-grid"), ...spreadIds("hero")],
    tags: ["yearbook", "annual", "classic"],
    previewAccent: "#6a7ea8",
  }),
  pack({
    id: "seasonal-yearbook",
    name: "Seasonal Yearbook",
    category: "yearbook",
    description: "A softer recap organized by seasons and recurring motifs.",
    formatId: "12x12-square",
    styleMode: "timeless_yearbook",
    fontPresetId: "salon",
    captionTone: "reflective",
    storyMode: "seasonal",
    themeId: "pine-ink",
    coverTemplateId: "minimal-grid-7",
    spreadTemplateIds: [...spreadIds("minimal-grid"), ...spreadIds("timeline"), ...spreadIds("caption")],
    tags: ["seasonal", "yearbook", "quiet"],
    previewAccent: "#335c52",
  }),
  pack({
    id: "minimal-gallery",
    name: "Minimal Gallery",
    category: "minimal",
    description: "Restrained gallery pages for users who want the photos to lead.",
    formatId: "12x12-square",
    styleMode: "clean_modern",
    fontPresetId: "studio",
    captionTone: "factual",
    storyMode: "theme_clusters",
    themeId: "coastline",
    coverTemplateId: "minimal-grid-1",
    spreadTemplateIds: [...spreadIds("minimal-grid"), ...spreadIds("caption"), ...spreadIds("full-bleed")],
    tags: ["minimal", "gallery", "clean"],
    previewAccent: "#6a7ea8",
  }),
  pack({
    id: "story-journal-classic",
    name: "Story Journal Classic",
    category: "minimal",
    description: "A quieter book system for reflective captions, travel notes, and gallery pacing.",
    formatId: "12x12-square",
    styleMode: "clean_modern",
    fontPresetId: "novel",
    captionTone: "reflective",
    storyMode: "theme_clusters",
    themeId: "coastline",
    coverTemplateId: "photo-journal-1",
    spreadTemplateIds: [...spreadIds("photo-journal"), ...spreadIds("minimal-grid"), ...spreadIds("caption")],
    tags: ["journal", "minimal", "reflective"],
    previewAccent: "#6a7ea8",
  }),
  pack({
    id: "coffee-table-premium",
    name: "Coffee Table Premium",
    category: "premium",
    description: "Large-format hero spreads with magazine-style pacing.",
    formatId: "12x12-square",
    styleMode: "minimal_editorial",
    fontPresetId: "continental",
    captionTone: "reflective",
    storyMode: "theme_clusters",
    themeId: "golden-hour",
    coverTemplateId: "full-bleed-8",
    spreadTemplateIds: [...spreadIds("full-bleed"), ...spreadIds("hero"), ...spreadIds("couple-story")],
    tags: ["premium", "coffee-table", "editorial"],
    previewAccent: "#c76c3a",
  }),
];

export function getDefaultTemplatePackId(projectType: "trip" | "yearbook") {
  return projectType === "yearbook" ? "annual-classic" : "trip-editorial-atlas";
}

export function getBookTemplatePack(templatePackId: string | null | undefined) {
  return BOOK_TEMPLATE_PACKS.find((packEntry) => packEntry.id === templatePackId) ?? null;
}

export function getSpreadTemplate(templateId: string | null | undefined) {
  return SPREAD_TEMPLATES.find((template) => template.id === templateId) ?? null;
}

export function getTemplatesForPack(templatePackId: string | null | undefined) {
  const packEntry = getBookTemplatePack(templatePackId);
  if (!packEntry) {
    return [];
  }

  const ids = new Set(packEntry.spreadTemplateIds);
  return SPREAD_TEMPLATES.filter((template) => ids.has(template.id));
}

export function listTemplateCatalog() {
  return {
    bookTemplatePacks: BOOK_TEMPLATE_PACKS,
    spreadTemplates: SPREAD_TEMPLATES,
  };
}
