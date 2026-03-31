import type { BookPage, PageLayoutStyle, PhotoAsset, Project, ProjectType } from "@photo-book-maker/core";

export type ApprovedSpreadType =
  | "hero_full_bleed"
  | "hero_support_strip"
  | "balanced_two_up"
  | "four_up_grid"
  | "dense_candid_grid"
  | "panorama_spread"
  | "text_divider"
  | "photo_journal"
  | "memorabilia_spread"
  | "pattern_repetition"
  | "burst_sequence"
  | "map_timeline";

export type EditorStyleMode =
  | "minimal_editorial"
  | "warm_scrapbook"
  | "clean_modern"
  | "bold_travel"
  | "timeless_yearbook";

export type EditorCaptionTone = "factual" | "warm" | "reflective" | "playful";

export type EditorStoryMode =
  | "route_story"
  | "day_by_day"
  | "location_clusters"
  | "theme_clusters"
  | "month_by_month"
  | "seasonal"
  | "people_focus";

export type PrintPreviewMode = "clean" | "print_safe" | "bleed";

export type StoryChapter = {
  id: string;
  title: string;
  subtitle: string;
  pageIds: string[];
};

export const APPROVED_SPREAD_LIBRARY: Array<{
  description: string;
  helper: string;
  id: ApprovedSpreadType;
  label: string;
}> = [
  {
    id: "hero_full_bleed",
    label: "Hero full bleed",
    description: "One dominant frame with minimal copy.",
    helper: "Use for the strongest landscape or chapter-defining image.",
  },
  {
    id: "hero_support_strip",
    label: "Hero + support strip",
    description: "Lead image followed by a slim supporting run.",
    helper: "Best when one frame leads and a few details provide context.",
  },
  {
    id: "balanced_two_up",
    label: "Balanced 2-up",
    description: "Two images with equal editorial weight.",
    helper: "Use when both images matter and need breathing room.",
  },
  {
    id: "four_up_grid",
    label: "4-up grid",
    description: "Structured medium-density recap spread.",
    helper: "Good for details, pairs, or a clean story checkpoint.",
  },
  {
    id: "dense_candid_grid",
    label: "Dense candid grid",
    description: "More energetic matrix for food, candids, and in-between moments.",
    helper: "Use when the page should feel collected, not heroic.",
  },
  {
    id: "panorama_spread",
    label: "Panorama spread",
    description: "Standalone panoramic treatment.",
    helper: "Reserve for the widest landscape and keep copy extremely light.",
  },
  {
    id: "text_divider",
    label: "Text divider",
    description: "Quiet chapter break with typography and almost no imagery.",
    helper: "Use to reset rhythm and separate chapters or months.",
  },
  {
    id: "photo_journal",
    label: "Photo + journal",
    description: "A small number of images paired with narrative copy.",
    helper: "Best for memory-note pages, reflections, or quieter closers.",
  },
  {
    id: "memorabilia_spread",
    label: "Memorabilia spread",
    description: "Tickets, food, signs, receipts, and supporting texture.",
    helper: "Great for trip proofing when small details deserve their own page.",
  },
  {
    id: "pattern_repetition",
    label: "Pattern / repetition",
    description: "Intentional repetition of similar moments or angles.",
    helper: "Works for yearly recaps or a repeated motif within a trip.",
  },
  {
    id: "burst_sequence",
    label: "Burst sequence",
    description: "Quick repeated frames arranged for motion.",
    helper: "Use on movement-heavy moments instead of forcing a single hero crop.",
  },
  {
    id: "map_timeline",
    label: "Map / timeline",
    description: "Route, date, or chapter context page.",
    helper: "Best near chapter openers, especially for travel books.",
  },
];

export const STYLE_MODE_OPTIONS: Array<{
  chipClass: string;
  description: string;
  id: EditorStyleMode;
  label: string;
  shellClass: string;
}> = [
  {
    id: "minimal_editorial",
    label: "Minimal Editorial",
    description: "Gallery calm, soft margins, and strong typography.",
    shellClass:
      "bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,239,232,0.96))]",
    chipClass: "bg-[#ece4db] text-[#7c604a]",
  },
  {
    id: "warm_scrapbook",
    label: "Warm Scrapbook",
    description: "Tactile cream, handwritten warmth, and softer contrast.",
    shellClass:
      "bg-[linear-gradient(180deg,rgba(255,251,247,0.98),rgba(242,230,219,0.96))]",
    chipClass: "bg-[#f0ddd0] text-[#945633]",
  },
  {
    id: "clean_modern",
    label: "Clean Modern",
    description: "Sharper white space and cooler restraint.",
    shellClass:
      "bg-[linear-gradient(180deg,rgba(255,255,255,0.995),rgba(242,243,244,0.97))]",
    chipClass: "bg-[#e9ecef] text-[#495057]",
  },
  {
    id: "bold_travel",
    label: "Bold Travel",
    description: "Richer contrast and stronger image-led sequencing.",
    shellClass:
      "bg-[linear-gradient(180deg,rgba(252,249,244,0.98),rgba(229,220,205,0.96))]",
    chipClass: "bg-[#e7dbc3] text-[#6b5432]",
  },
  {
    id: "timeless_yearbook",
    label: "Timeless Yearbook",
    description: "Quiet classic tone with seasonal rhythm.",
    shellClass:
      "bg-[linear-gradient(180deg,rgba(253,251,247,0.98),rgba(238,234,227,0.96))]",
    chipClass: "bg-[#e8e2d8] text-[#6d6459]",
  },
];

const LEGACY_STYLE_MAP: Record<PageLayoutStyle, ApprovedSpreadType> = {
  hero: "hero_support_strip",
  full_bleed: "hero_full_bleed",
  balanced: "balanced_two_up",
  collage: "dense_candid_grid",
  recap: "four_up_grid",
  diptych: "balanced_two_up",
  chapter: "photo_journal",
  mosaic: "pattern_repetition",
  closing: "photo_journal",
  hero_full_bleed: "hero_full_bleed",
  hero_support_strip: "hero_support_strip",
  balanced_two_up: "balanced_two_up",
  four_up_grid: "four_up_grid",
  dense_candid_grid: "dense_candid_grid",
  panorama_spread: "panorama_spread",
  text_divider: "text_divider",
  photo_journal: "photo_journal",
  memorabilia_spread: "memorabilia_spread",
  pattern_repetition: "pattern_repetition",
  burst_sequence: "burst_sequence",
  map_timeline: "map_timeline",
};

export function normalizeSpreadType(style: PageLayoutStyle): ApprovedSpreadType {
  return LEGACY_STYLE_MAP[style] ?? "balanced_two_up";
}

export function getStoryModeOptions(project: Project): Array<{ id: EditorStoryMode; label: string; helper: string }> {
  if (project.type === "yearbook") {
    return [
      { id: "month_by_month", label: "Month by month", helper: "Classic yearly recap with monthly dividers." },
      { id: "seasonal", label: "Seasonal", helper: "Chunk the year into winter, spring, summer, and fall." },
      { id: "people_focus", label: "People focus", helper: "Center the year around the people who appear most." },
      { id: "theme_clusters", label: "Theme clusters", helper: "Group the year by mood, place, and repeated motifs." },
    ];
  }

  return [
    { id: "route_story", label: "Route story", helper: "Sequence the trip around movement and major stops." },
    { id: "day_by_day", label: "Day by day", helper: "Treat each day as its own chapter." },
    { id: "location_clusters", label: "Location clusters", helper: "Group by city, park stop, or place." },
    { id: "theme_clusters", label: "Theme clusters", helper: "Group by mood: arrival, details, food, landscape, close." },
  ];
}

export function getCaptionToneOptions(): Array<{ id: EditorCaptionTone; label: string; helper: string }> {
  return [
    { id: "factual", label: "Factual", helper: "Where, when, and who with clear context." },
    { id: "warm", label: "Warm", helper: "Short memory-driven captions with emotional softness." },
    { id: "reflective", label: "Reflective", helper: "More narrative and memory-led chapter copy." },
    { id: "playful", label: "Playful", helper: "Lighter captions for candids and in-between moments." },
  ];
}

export function deriveStoryChapters(project: Project, storyMode: EditorStoryMode): StoryChapter[] {
  const pages = project.bookDraft.pages;

  if (!pages.length) {
    return [];
  }

  switch (storyMode) {
    case "day_by_day":
    case "month_by_month":
    case "seasonal":
      return groupPagesByDate(project, storyMode);
    case "location_clusters":
      return groupPagesByLocation(project);
    case "people_focus":
      return groupPagesByPeople(project);
    case "theme_clusters":
      return groupPagesByStoryBeat(project);
    case "route_story":
    default:
      return groupPagesByRoute(project);
  }
}

function groupPagesByRoute(project: Project): StoryChapter[] {
  const pages = project.bookDraft.pages;
  const first = pages.slice(0, Math.max(1, Math.ceil(pages.length / 3)));
  const second = pages.slice(first.length, Math.max(first.length, Math.ceil((pages.length * 2) / 3)));
  const third = pages.slice(first.length + second.length);

  return [
    buildChapter("chapter-arrival", "Arrival and setup", "Open with context, first look, and orientation.", first),
    buildChapter("chapter-middle", "Main stretch", "Hero views, movement, and the strongest pairings.", second),
    buildChapter("chapter-close", "Quiet close", "Hold softer details and reflective pages at the end.", third),
  ].filter((chapter) => chapter.pageIds.length > 0);
}

function groupPagesByStoryBeat(project: Project): StoryChapter[] {
  const groups = new Map<string, BookPage[]>();

  for (const page of project.bookDraft.pages) {
    const key = page.storyBeat;
    const list = groups.get(key) ?? [];
    list.push(page);
    groups.set(key, list);
  }

  return [...groups.entries()].map(([key, pages]) =>
    buildChapter(
      `chapter-${key}`,
      sentenceCase(key.replaceAll("_", " ")),
      `Group similar moments together instead of forcing a purely linear book.`,
      pages,
    ),
  );
}

function groupPagesByLocation(project: Project): StoryChapter[] {
  const groups = new Map<string, BookPage[]>();

  for (const page of project.bookDraft.pages) {
    const location = getPrimaryLocationForPage(project, page) ?? "Location still unresolved";
    const list = groups.get(location) ?? [];
    list.push(page);
    groups.set(location, list);
  }

  return [...groups.entries()].map(([location, pages], index) =>
    buildChapter(
      `chapter-location-${index}`,
      location,
      `Use a divider and map context before this location cluster.`,
      pages,
    ),
  );
}

function groupPagesByPeople(project: Project): StoryChapter[] {
  const groups = new Map<string, BookPage[]>();

  for (const page of project.bookDraft.pages) {
    const label = getPeopleLabelForPage(project, page) ?? "Shared moments";
    const list = groups.get(label) ?? [];
    list.push(page);
    groups.set(label, list);
  }

  return [...groups.entries()].map(([label, pages], index) =>
    buildChapter(
      `chapter-people-${index}`,
      label,
      `Use this if the book should read around people rather than place.`,
      pages,
    ),
  );
}

function groupPagesByDate(project: Project, storyMode: "day_by_day" | "month_by_month" | "seasonal"): StoryChapter[] {
  const groups = new Map<string, BookPage[]>();

  for (const page of project.bookDraft.pages) {
    const date = getPrimaryDateForPage(project, page);
    const key = formatDateBucket(date, storyMode, project.type);
    const list = groups.get(key) ?? [];
    list.push(page);
    groups.set(key, list);
  }

  return [...groups.entries()].map(([label, pages], index) =>
    buildChapter(
      `chapter-date-${index}`,
      label,
      storyMode === "seasonal"
        ? "Seasonal dividers keep a yearly recap from feeling like a dump of months."
        : "Use a text divider before the next date block for better rhythm.",
      pages,
    ),
  );
}

function buildChapter(id: string, title: string, subtitle: string, pages: BookPage[]): StoryChapter {
  return {
    id,
    title,
    subtitle,
    pageIds: pages.map((page) => page.id),
  };
}

function getPrimaryLocationForPage(project: Project, page: BookPage) {
  return page.photoIds
    .map((photoId) => project.photos.find((photo) => photo.id === photoId)?.locationLabel)
    .find((value): value is string => Boolean(value));
}

function getPrimaryDateForPage(project: Project, page: BookPage) {
  return (
    page.photoIds
      .map((photoId) => project.photos.find((photo) => photo.id === photoId)?.capturedAt)
      .find((value): value is string => Boolean(value)) ?? `${project.startDate}T12:00:00.000Z`
  );
}

function getPeopleLabelForPage(project: Project, page: BookPage) {
  const names = [...new Set(
    page.photoIds.flatMap((photoId) => {
      const photo = project.photos.find((entry) => entry.id === photoId);
      return (photo?.peopleIds ?? [])
        .map((personId) => project.members.find((member) => member.id === personId)?.name)
        .filter((name): name is string => Boolean(name));
    }),
  )];

  if (!names.length) {
    return null;
  }

  if (names.length === 1) {
    return names[0];
  }

  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }

  return `${names[0]} + company`;
}

function formatDateBucket(dateString: string, storyMode: "day_by_day" | "month_by_month" | "seasonal", projectType: ProjectType) {
  const date = new Date(dateString);

  if (storyMode === "month_by_month") {
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  if (storyMode === "seasonal") {
    const month = date.getUTCMonth();
    const season =
      month <= 1 || month === 11
        ? "Winter"
        : month <= 4
          ? "Spring"
          : month <= 7
            ? "Summer"
            : "Fall";
    return projectType === "yearbook" ? `${season} ${date.getUTCFullYear()}` : `${season} stretch`;
  }

  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function getLayoutAlternatives(
  project: Project,
  page: BookPage,
  photos: PhotoAsset[],
): ApprovedSpreadType[] {
  const base = normalizeSpreadType(page.style);
  const alternatives = new Set<ApprovedSpreadType>([base]);
  const photoCount = photos.length;

  if (photoCount === 0) {
    alternatives.add(project.type === "trip" ? "map_timeline" : "text_divider");
    alternatives.add("photo_journal");
    return [...alternatives];
  }

  if (photos.some((photo) => isPanoramaCandidate(photo))) {
    alternatives.add("panorama_spread");
  }

  if (photoCount === 1) {
    alternatives.add("hero_full_bleed");
    alternatives.add("hero_support_strip");
    alternatives.add("photo_journal");
  } else if (photoCount === 2) {
    alternatives.add("balanced_two_up");
    alternatives.add("photo_journal");
    alternatives.add("pattern_repetition");
  } else if (photoCount <= 4) {
    alternatives.add("four_up_grid");
    alternatives.add("pattern_repetition");
    alternatives.add("memorabilia_spread");
  } else {
    alternatives.add("dense_candid_grid");
    alternatives.add("burst_sequence");
    alternatives.add("memorabilia_spread");
  }

  if (photos.every((photo) => isDetailMoment(photo))) {
    alternatives.add("memorabilia_spread");
  }

  return [...alternatives].slice(0, 3);
}

export function getPageWarnings(
  page: BookPage,
  photos: PhotoAsset[],
  formatId: string,
): string[] {
  const warnings: string[] = [];
  const spreadType = normalizeSpreadType(page.style);
  const heroLike =
    spreadType === "hero_full_bleed" ||
    spreadType === "panorama_spread" ||
    spreadType === "hero_support_strip";

  for (const photo of photos) {
    const resolution = getLargestResolution(photo);
    if (!resolution) {
      continue;
    }

    const [width, height] = resolution;
    const longEdge = Math.max(width, height);

    if (heroLike && longEdge < 1800) {
      warnings.push(`${photo.title} is low resolution for a hero-scale print spread.`);
    } else if (spreadType === "four_up_grid" && longEdge < 1200) {
      warnings.push(`${photo.title} should stay small or move to a denser support layout.`);
    }
  }

  if (spreadType === "panorama_spread" && !photos.some((photo) => isPanoramaCandidate(photo))) {
    warnings.push("This spread is set to panorama, but none of the selected photos are especially wide.");
  }

  if (spreadType === "hero_full_bleed" && photos.length > 1) {
    warnings.push("Hero full bleed works best with one dominant image. Extra photos should move to a support strip.");
  }

  if (formatId === "11x8.5-landscape" && spreadType === "hero_support_strip") {
    warnings.push("Landscape trim reduces footer space. Keep hero captions especially short here.");
  }

  return [...new Set(warnings)];
}

export function isPanoramaCandidate(photo: PhotoAsset) {
  const resolution = getLargestResolution(photo);
  if (!resolution) {
    return false;
  }

  const [width, height] = resolution;
  return width / height >= 1.75;
}

function isDetailMoment(photo: PhotoAsset) {
  const text = `${photo.title} ${photo.qualityNotes.join(" ")}`.toLowerCase();
  return ["food", "ticket", "receipt", "coffee", "detail", "close"].some((keyword) =>
    text.includes(keyword),
  );
}

function getLargestResolution(photo: PhotoAsset) {
  const biggest = [...photo.versions].sort(
    (left, right) => right.width * right.height - left.width * left.height,
  )[0];

  return biggest ? [biggest.width, biggest.height] as const : null;
}

function sentenceCase(value: string) {
  return value ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}` : value;
}
