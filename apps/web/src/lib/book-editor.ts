import type { BookPage, PageLayoutStyle, PhotoAsset, Project, ProjectType } from "@photo-book-maker/core";
import { normalizeStoryLayoutSystem, type StoryLayoutSystem } from "@/lib/story-layout-engine";

export type ApprovedSpreadType = StoryLayoutSystem;

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
    id: "minimal_grid",
    label: "Minimal grid",
    description: "2 to 4 images with disciplined spacing and no wasted interior space.",
    helper: "Use for clean, balanced pages where the photography should feel organized and premium.",
  },
  {
    id: "hero",
    label: "Hero",
    description: "One dominant image with support photos or a compact story tile.",
    helper: "Best when one image should clearly lead the spread without becoming a full-bleed page.",
  },
  {
    id: "collage",
    label: "Collage",
    description: "5 to 12 images in a dense but controlled composition.",
    helper: "Use when the page should feel energetic and memory-rich without looking random.",
  },
  {
    id: "couple_story",
    label: "Couple story",
    description: "One or two emotional images paired with a stronger story block.",
    helper: "Best for relationship moments, quieter reflections, and pages that need a little more voice.",
  },
  {
    id: "family_recap",
    label: "Family recap",
    description: "3 to 6 grouped images with one compact supporting text area.",
    helper: "Use for event recaps, day summaries, and pages where multiple people or moments belong together.",
  },
  {
    id: "timeline",
    label: "Timeline",
    description: "Sequential image-led storytelling with light chronology cues.",
    helper: "Use when order matters, especially for travel days, route changes, or chapter setup.",
  },
  {
    id: "full_bleed",
    label: "Full bleed",
    description: "One image fills nearly the entire page with restrained overlay copy.",
    helper: "Reserve for the strongest scenic or emotional frame that can carry a whole spread.",
  },
  {
    id: "caption",
    label: "Caption",
    description: "Image-led page with a deliberate text block filling the leftover structure.",
    helper: "Use when the story needs a stronger written moment without turning into a divider page.",
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

export function normalizeSpreadType(style: PageLayoutStyle): ApprovedSpreadType {
  return normalizeStoryLayoutSystem(style);
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
    alternatives.add(project.type === "trip" ? "timeline" : "caption");
    alternatives.add("minimal_grid");
    return [...alternatives];
  }

  if (photoCount === 1) {
    alternatives.add(photos.some((photo) => isPanoramaCandidate(photo)) ? "full_bleed" : "hero");
    alternatives.add(page.storyBeat === "reflection" || page.storyBeat === "closing" ? "caption" : "couple_story");
    alternatives.add("minimal_grid");
  } else if (photoCount === 2) {
    alternatives.add("minimal_grid");
    alternatives.add(project.type === "yearbook" ? "family_recap" : "couple_story");
    alternatives.add("caption");
  } else if (photoCount <= 4) {
    alternatives.add("minimal_grid");
    alternatives.add("family_recap");
    alternatives.add(project.type === "trip" && page.storyBeat === "scene_setter" ? "timeline" : "collage");
  } else {
    alternatives.add("collage");
    alternatives.add("family_recap");
    alternatives.add(project.type === "trip" ? "timeline" : "caption");
  }

  if (photos.every((photo) => isDetailMoment(photo))) {
    alternatives.add("family_recap");
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
    spreadType === "full_bleed" ||
    spreadType === "hero";

  for (const photo of photos) {
    const resolution = getLargestResolution(photo);
    if (!resolution) {
      continue;
    }

    const [width, height] = resolution;
    const longEdge = Math.max(width, height);

    if (heroLike && longEdge < 1800) {
      warnings.push(`${photo.title} is low resolution for a hero-scale print spread.`);
    } else if (spreadType === "minimal_grid" && longEdge < 1200) {
      warnings.push(`${photo.title} should stay small or move to a denser support layout.`);
    }
  }

  if (spreadType === "full_bleed" && !photos.some((photo) => isPanoramaCandidate(photo)) && photos.length > 1) {
    warnings.push("Full bleed works best when one image clearly dominates the page.");
  }

  if (spreadType === "hero" && photos.length > 4) {
    warnings.push("Hero layouts flatten out when too many support photos are forced onto the page.");
  }

  if (formatId === "11x8.5-landscape" && spreadType === "caption") {
    warnings.push("Landscape trim makes long side captions feel heavier. Keep the copy block short.");
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
