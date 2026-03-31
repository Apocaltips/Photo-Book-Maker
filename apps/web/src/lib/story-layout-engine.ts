import type {
  BookDraftEditorState,
  BookDraftFormatId,
  BookPage,
  PageLayoutStyle,
  PhotoAsset,
  Project,
} from "@photo-book-maker/core";

export type StoryLayoutSystem =
  | "minimal_grid"
  | "hero"
  | "collage"
  | "couple_story"
  | "family_recap"
  | "timeline"
  | "full_bleed"
  | "caption";

export type StoryLayoutRect = {
  h: number;
  w: number;
  x: number;
  y: number;
};

export type StoryLayoutElement =
  | {
      id: string;
      photo?: PhotoAsset;
      position: StoryLayoutRect;
      type: "image";
      variant?: "hero" | "support";
      zIndex: number;
    }
  | {
      body?: string;
      eyebrow?: string;
      id: string;
      position: StoryLayoutRect;
      title?: string;
      type: "text";
      variant: "card" | "overlay" | "strip";
      zIndex: number;
    };

export type StoryLayoutVariation = {
  elements: StoryLayoutElement[];
  layout_type: Uppercase<StoryLayoutSystem>;
  style: {
    background: string;
    padding: number;
    spacing: number;
  };
  variationIndex: number;
};

function rect(x: number, y: number, w: number, h: number): StoryLayoutRect {
  return { x, y, w, h };
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildCopy(page: BookPage) {
  const title = truncateWords(page.title, 6);
  const body = truncateSentence(firstSentence(page.caption || page.curationNote), 88);
  const eyebrow = sentenceCase(page.storyBeat.replaceAll("_", " "));
  return { body, eyebrow, title };
}

function firstSentence(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "";
  }

  const match = trimmed.match(/^(.+?[.!?])(?:\s|$)/);
  return match?.[1] ?? trimmed;
}

function sentenceCase(value: string) {
  return value ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}` : value;
}

function truncateSentence(value: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const clipped = normalized.slice(0, Math.max(0, maxLength - 1));
  return `${clipped.replace(/[,\s]+$/, "")}...`;
}

function truncateWords(value: string, maxWords: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return value.trim();
  }

  return `${words.slice(0, maxWords).join(" ")}...`;
}

function imageElement(
  id: string,
  photo: PhotoAsset | undefined,
  position: StoryLayoutRect,
  zIndex: number,
  variant: "hero" | "support" = "support",
): StoryLayoutElement {
  return {
    id,
    photo,
    position,
    type: "image",
    variant,
    zIndex,
  };
}

function textElement(
  id: string,
  position: StoryLayoutRect,
  copy: ReturnType<typeof buildCopy>,
  variant: "card" | "overlay" | "strip",
  zIndex: number,
): StoryLayoutElement {
  return {
    body: copy.body,
    eyebrow: copy.eyebrow,
    id,
    position,
    title: copy.title,
    type: "text",
    variant,
    zIndex,
  };
}

function normalizeOldLayout(style: PageLayoutStyle): StoryLayoutSystem {
  switch (style) {
    case "hero":
    case "hero_support_strip":
      return "hero";
    case "full_bleed":
    case "hero_full_bleed":
    case "panorama_spread":
      return "full_bleed";
    case "balanced":
    case "diptych":
    case "balanced_two_up":
    case "four_up_grid":
    case "minimal_grid":
      return "minimal_grid";
    case "collage":
    case "dense_candid_grid":
    case "pattern_repetition":
    case "burst_sequence":
      return "collage";
    case "chapter":
    case "photo_journal":
    case "couple_story":
      return "couple_story";
    case "recap":
    case "memorabilia_spread":
    case "family_recap":
      return "family_recap";
    case "map_timeline":
    case "timeline":
      return "timeline";
    case "text_divider":
    case "closing":
    case "caption":
      return "caption";
    default:
      return "minimal_grid";
  }
}

function familyStyle(page: BookPage, project: Project, photos: PhotoAsset[]): StoryLayoutSystem {
  const current = normalizeOldLayout(page.style);

  if (current) {
    return current;
  }

  if (photos.length === 1 && page.storyBeat === "highlight") {
    return "full_bleed";
  }

  if (photos.length > 6) {
    return "collage";
  }

  if (project.type === "trip" && page.storyBeat === "scene_setter") {
    return "timeline";
  }

  return "minimal_grid";
}

function familyBackground(system: StoryLayoutSystem) {
  switch (system) {
    case "full_bleed":
      return "linear-gradient(180deg,rgba(18,14,11,0.98),rgba(32,23,18,0.94))";
    case "collage":
      return "linear-gradient(180deg,rgba(251,247,242,0.98),rgba(244,236,228,0.96))";
    case "timeline":
      return "linear-gradient(180deg,rgba(250,246,239,0.98),rgba(246,237,228,0.96))";
    case "couple_story":
      return "linear-gradient(180deg,rgba(246,239,231,0.98),rgba(240,229,220,0.96))";
    default:
      return "linear-gradient(180deg,rgba(255,255,255,0.985),rgba(246,241,235,0.97))";
  }
}

function heroVariations(page: BookPage, photos: PhotoAsset[]) {
  const copy = buildCopy(page);
  const hero = photos[0];
  const support = photos.slice(1);

  return [
    [
      imageElement("hero", hero, rect(0, 0, support.length ? 0.7 : 1, 1), 1, "hero"),
      ...(support[0] ? [imageElement("support-1", support[0], rect(0.72, 0, 0.28, 0.34), 1)] : []),
      ...(support[1] ? [imageElement("support-2", support[1], rect(0.72, 0.36, 0.28, 0.28), 1)] : []),
      textElement("text", rect(0.72, support[1] ? 0.66 : 0.72, 0.28, support[1] ? 0.34 : 0.28), copy, "card", 2),
    ],
    [
      imageElement("hero", hero, rect(0, 0, 1, support.length ? 0.73 : 1), 1, "hero"),
      ...(support[0] ? [imageElement("support-1", support[0], rect(0, 0.75, 0.3, 0.25), 1)] : []),
      ...(support[1] ? [imageElement("support-2", support[1], rect(0.32, 0.75, 0.3, 0.25), 1)] : []),
      textElement("text", rect(support[1] ? 0.64 : 0.72, 0.75, support[1] ? 0.36 : 0.28, 0.25), copy, "card", 2),
    ],
    [
      imageElement("hero", hero, rect(support.length ? 0.32 : 0, 0, support.length ? 0.68 : 1, 1), 1, "hero"),
      textElement("text", rect(0, 0, 0.3, 0.34), copy, "card", 2),
      ...(support[0] ? [imageElement("support-1", support[0], rect(0, 0.36, 0.3, 0.3), 1)] : []),
      ...(support[1] ? [imageElement("support-2", support[1], rect(0, 0.68, 0.3, 0.32), 1)] : []),
    ],
  ];
}

function fullBleedVariations(page: BookPage, photos: PhotoAsset[]) {
  const copy = buildCopy(page);
  const hero = photos[0];
  const support = photos.slice(1, 3);

  return [
    [
      imageElement("hero", hero, rect(0, 0, 1, 1), 1, "hero"),
      textElement("text", rect(0.05, 0.72, 0.38, 0.2), copy, "overlay", 3),
      ...(support[0] ? [imageElement("support-1", support[0], rect(0.76, 0.72, 0.19, 0.2), 2)] : []),
    ],
    [
      imageElement("hero", hero, rect(0, 0, 1, 1), 1, "hero"),
      textElement("text", rect(0.05, 0.06, 0.34, 0.18), copy, "overlay", 3),
      ...(support[0] ? [imageElement("support-1", support[0], rect(0.7, 0.72, 0.12, 0.18), 2)] : []),
      ...(support[1] ? [imageElement("support-2", support[1], rect(0.84, 0.72, 0.11, 0.18), 2)] : []),
    ],
    [
      imageElement("hero", hero, rect(0, 0, 1, 0.8), 1, "hero"),
      ...(support[0] ? [imageElement("support-1", support[0], rect(0, 0.82, 0.3, 0.18), 2)] : []),
      ...(support[1] ? [imageElement("support-2", support[1], rect(0.32, 0.82, 0.3, 0.18), 2)] : []),
      textElement("text", rect(support[1] ? 0.64 : 0.7, 0.82, support[1] ? 0.36 : 0.3, 0.18), copy, "card", 3),
    ],
  ];
}

function minimalGridVariations(page: BookPage, photos: PhotoAsset[]) {
  const copy = buildCopy(page);
  const firstFour = photos.slice(0, 4);
  const count = firstFour.length;

  const v1 =
    count === 1
      ? [
          imageElement("image-0", firstFour[0], rect(0, 0, 1, 0.82), 1, "hero"),
          textElement("text", rect(0, 0.84, 1, 0.16), copy, "strip", 2),
        ]
      : count <= 2
      ? [
          imageElement("image-0", firstFour[0], rect(0, 0, 0.49, 1), 1, "hero"),
          imageElement("image-1", firstFour[1], rect(0.51, 0, 0.49, 1), 1, "hero"),
        ]
      : count === 3
        ? [
            imageElement("image-0", firstFour[0], rect(0, 0, 0.49, 0.48), 1, "hero"),
            imageElement("image-1", firstFour[1], rect(0.51, 0, 0.49, 0.48), 1, "hero"),
            imageElement("image-2", firstFour[2], rect(0, 0.52, 1, 0.48), 1),
          ]
        : [
            imageElement("image-0", firstFour[0], rect(0, 0, 0.49, 0.49), 1),
            imageElement("image-1", firstFour[1], rect(0.51, 0, 0.49, 0.49), 1),
            imageElement("image-2", firstFour[2], rect(0, 0.51, 0.49, 0.49), 1),
            imageElement("image-3", firstFour[3], rect(0.51, 0.51, 0.49, 0.49), 1),
          ];

  const v2 =
    count === 1
      ? [
          imageElement("image-0", firstFour[0], rect(0, 0, 0.72, 1), 1, "hero"),
          textElement("text", rect(0.74, 0.08, 0.26, 0.84), copy, "card", 2),
        ]
      : count <= 2
      ? [
          imageElement("image-0", firstFour[0], rect(0, 0, 1, 0.58), 1, "hero"),
          imageElement("image-1", firstFour[1], rect(0, 0.62, 1, 0.38), 1),
        ]
      : [
          imageElement("image-0", firstFour[0], rect(0, 0, 0.66, 1), 1, "hero"),
          imageElement("image-1", firstFour[1], rect(0.68, 0, 0.32, 0.32), 1),
          imageElement("image-2", firstFour[2], rect(0.68, 0.34, 0.32, 0.32), 1),
          ...(firstFour[3]
            ? [imageElement("image-3", firstFour[3], rect(0.68, 0.68, 0.32, 0.32), 1)]
            : [textElement("text", rect(0.68, 0.68, 0.32, 0.32), copy, "card", 2)]),
        ];

  const v3 =
    count <= 1
      ? [
          imageElement("image-0", firstFour[0], rect(0, 0, 1, 0.82), 1, "hero"),
          textElement("text", rect(0, 0.84, 1, 0.16), copy, "strip", 2),
        ]
      : [
          imageElement("image-0", firstFour[0], rect(0, 0, 0.58, 0.58), 1, "hero"),
          imageElement("image-1", firstFour[1], rect(0.6, 0, 0.4, 0.58), 1),
          ...(firstFour[2] ? [imageElement("image-2", firstFour[2], rect(0, 0.62, 0.48, 0.38), 1)] : []),
          ...(firstFour[3]
            ? [imageElement("image-3", firstFour[3], rect(0.52, 0.62, 0.48, 0.38), 1)]
            : [textElement("text", rect(0.52, 0.62, 0.48, 0.38), copy, "card", 2)]),
        ];

  return [v1, v2, v3];
}

function collageVariations(page: BookPage, photos: PhotoAsset[]) {
  const copy = buildCopy(page);
  const visible = photos.slice(0, 8);

  return [
    [
      ...visible.slice(0, 6).map((photo, index) => {
        const positions = [
          rect(0, 0, 0.42, 0.56),
          rect(0.44, 0, 0.26, 0.27),
          rect(0.72, 0, 0.28, 0.27),
          rect(0.44, 0.29, 0.56, 0.27),
          rect(0, 0.6, 0.28, 0.4),
          rect(0.3, 0.6, 0.34, 0.4),
        ];
        return imageElement(`image-${index}`, photo, positions[index]!, 1, index === 0 ? "hero" : "support");
      }),
      ...(visible[6]
        ? [imageElement("image-6", visible[6], rect(0.66, 0.6, 0.34, 0.4), 1)]
        : [textElement("text", rect(0.66, 0.6, 0.34, 0.4), copy, "card", 2)]),
    ],
    [
      ...visible.slice(0, 7).map((photo, index) => {
        const positions = [
          rect(0, 0, 0.3, 0.34),
          rect(0.32, 0, 0.36, 0.34),
          rect(0.7, 0, 0.3, 0.52),
          rect(0, 0.36, 0.32, 0.3),
          rect(0.34, 0.36, 0.34, 0.3),
          rect(0, 0.68, 0.48, 0.32),
          rect(0.5, 0.54, 0.18, 0.46),
        ];
        return imageElement(`image-${index}`, photo, positions[index]!, 1, index === 2 ? "hero" : "support");
      }),
      textElement("text", rect(0.7, 0.54, 0.3, 0.46), copy, "card", 2),
    ],
    [
      ...visible.slice(0, 5).map((photo, index) => {
        const positions = [
          rect(0, 0, 0.62, 0.62),
          rect(0.64, 0, 0.36, 0.3),
          rect(0.64, 0.32, 0.36, 0.3),
          rect(0, 0.66, 0.3, 0.34),
          rect(0.32, 0.66, 0.3, 0.34),
        ];
        return imageElement(`image-${index}`, photo, positions[index]!, 1, index === 0 ? "hero" : "support");
      }),
      ...(visible[5]
        ? [imageElement("image-5", visible[5], rect(0.64, 0.66, 0.36, 0.34), 1)]
        : [textElement("text", rect(0.64, 0.66, 0.36, 0.34), copy, "card", 2)]),
    ],
  ];
}

function coupleStoryVariations(page: BookPage, photos: PhotoAsset[]) {
  const copy = buildCopy(page);
  const hero = photos[0];
  const support = photos[1];

  return [
    [
      imageElement("hero", hero, rect(0, 0, 0.62, 1), 1, "hero"),
      ...(support ? [imageElement("support", support, rect(0.64, 0, 0.36, 0.46), 1)] : []),
      textElement("text", rect(0.64, support ? 0.5 : 0, 0.36, support ? 0.5 : 1), copy, "card", 2),
    ],
    [
      imageElement("hero", hero, rect(0, 0, 1, 0.64), 1, "hero"),
      textElement("text", rect(0, 0.68, support ? 0.42 : 1, 0.32), copy, "card", 2),
      ...(support ? [imageElement("support", support, rect(0.46, 0.68, 0.54, 0.32), 1)] : []),
    ],
    [
      imageElement("hero", hero, rect(0.38, 0, 0.62, 1), 1, "hero"),
      textElement("text", rect(0, 0, 0.34, support ? 0.46 : 1), copy, "card", 2),
      ...(support ? [imageElement("support", support, rect(0, 0.5, 0.34, 0.5), 1)] : []),
    ],
  ];
}

function familyRecapVariations(page: BookPage, photos: PhotoAsset[]) {
  const copy = buildCopy(page);
  const visible = photos.slice(0, 6);

  return [
    [
      imageElement("hero", visible[0], rect(0, 0, 1, 0.52), 1, "hero"),
      ...visible.slice(1, 4).map((photo, index) =>
        imageElement(`image-${index + 1}`, photo, rect(index * 0.34, 0.56, 0.32, 0.44), 1),
      ),
      ...(visible[4]
        ? [imageElement("image-4", visible[4], rect(0.68, 0.56, 0.32, 0.44), 1)]
        : [textElement("text", rect(0.68, 0.56, 0.32, 0.44), copy, "card", 2)]),
    ],
    [
      imageElement("hero", visible[0], rect(0, 0, 0.56, 1), 1, "hero"),
      ...visible.slice(1, 5).map((photo, index) =>
        imageElement(`image-${index + 1}`, photo, rect(0.6 + (index % 2) * 0.2, Math.floor(index / 2) * 0.25, 0.18, 0.23), 1),
      ),
      textElement("text", rect(0.6, 0.76, 0.4, 0.24), copy, "card", 2),
    ],
    [
      ...visible.slice(0, 4).map((photo, index) =>
        imageElement(
          `image-${index}`,
          photo,
          [
            rect(0, 0, 0.49, 0.58),
            rect(0.51, 0, 0.49, 0.58),
            rect(0, 0.62, 0.32, 0.38),
            rect(0.34, 0.62, 0.32, 0.38),
          ][index]!,
          1,
          index <= 1 ? "hero" : "support",
        ),
      ),
      ...(visible[4]
        ? [imageElement("image-4", visible[4], rect(0.68, 0.62, 0.32, 0.38), 1)]
        : [textElement("text", rect(0.68, 0.62, 0.32, 0.38), copy, "card", 2)]),
    ],
  ];
}

function timelineVariations(page: BookPage, photos: PhotoAsset[]) {
  const copy = buildCopy(page);
  const visible = photos.slice(0, 4);

  return [
    [
      textElement("text-0", rect(0, 0, 0.18, 0.28), copy, "card", 2),
      imageElement("image-0", visible[0], rect(0.22, 0, 0.78, 0.28), 1, "hero"),
      ...(visible[1]
        ? [imageElement("image-1", visible[1], rect(0, 0.36, 0.48, 0.28), 1)]
        : [textElement("text-1", rect(0, 0.36, 0.48, 0.28), copy, "card", 2)]),
      textElement("text-2", rect(0.52, 0.36, 0.48, 0.18), copy, "strip", 2),
      ...(visible[2]
        ? [imageElement("image-2", visible[2], rect(0.52, 0.58, 0.48, 0.42), 1)]
        : [textElement("text-3", rect(0.52, 0.58, 0.48, 0.42), copy, "card", 2)]),
      ...(visible[3]
        ? [imageElement("image-3", visible[3], rect(0, 0.68, 0.48, 0.32), 1)]
        : []),
    ],
    [
      imageElement("image-0", visible[0], rect(0, 0, 1, 0.42), 1, "hero"),
      textElement("text-0", rect(0, 0.46, 1, 0.12), copy, "strip", 2),
      ...(visible[1]
        ? [imageElement("image-1", visible[1], rect(0, 0.62, 0.49, 0.38), 1)]
        : [textElement("text-1", rect(0, 0.62, 0.49, 0.38), copy, "card", 2)]),
      ...(visible[2]
        ? [imageElement("image-2", visible[2], rect(0.51, 0.62, 0.49, 0.38), 1)]
        : [textElement("text-2", rect(0.51, 0.62, 0.49, 0.38), copy, "card", 2)]),
    ],
    [
      textElement("text-0", rect(0, 0, 0.32, 0.22), copy, "card", 2),
      imageElement("image-0", visible[0], rect(0.36, 0, 0.64, 0.48), 1, "hero"),
      ...(visible[1]
        ? [imageElement("image-1", visible[1], rect(0, 0.28, 0.32, 0.72), 1)]
        : [textElement("text-1", rect(0, 0.28, 0.32, 0.72), copy, "card", 2)]),
      ...(visible[2]
        ? [imageElement("image-2", visible[2], rect(0.36, 0.52, 0.3, 0.48), 1)]
        : [textElement("text-2", rect(0.36, 0.52, 0.3, 0.48), copy, "card", 2)]),
      ...(visible[3]
        ? [imageElement("image-3", visible[3], rect(0.7, 0.52, 0.3, 0.48), 1)]
        : [textElement("text-3", rect(0.7, 0.52, 0.3, 0.48), copy, "card", 2)]),
    ],
  ];
}

function captionVariations(page: BookPage, photos: PhotoAsset[]) {
  const copy = buildCopy(page);
  const hero = photos[0];
  const support = photos[1];

  return [
    [
      imageElement("hero", hero, rect(0, 0, 0.72, 1), 1, "hero"),
      textElement("text", rect(0.75, 0.08, 0.25, 0.84), copy, "card", 2),
    ],
    [
      imageElement("hero", hero, rect(0, 0, 1, 0.72), 1, "hero"),
      textElement("text", rect(0, 0.76, support ? 0.48 : 1, 0.24), copy, "card", 2),
      ...(support ? [imageElement("support", support, rect(0.52, 0.76, 0.48, 0.24), 1)] : []),
    ],
    [
      imageElement("hero", hero, rect(0.28, 0, 0.72, 1), 1, "hero"),
      textElement("text", rect(0, 0, 0.24, 1), copy, "card", 2),
    ],
  ];
}

function buildVariationSet(
  system: StoryLayoutSystem,
  page: BookPage,
  photos: PhotoAsset[],
): StoryLayoutVariation[] {
  const rawVariations = (() => {
    switch (system) {
      case "hero":
        return heroVariations(page, photos);
      case "collage":
        return collageVariations(page, photos);
      case "couple_story":
        return coupleStoryVariations(page, photos);
      case "family_recap":
        return familyRecapVariations(page, photos);
      case "timeline":
        return timelineVariations(page, photos);
      case "full_bleed":
        return fullBleedVariations(page, photos);
      case "caption":
        return captionVariations(page, photos);
      case "minimal_grid":
      default:
        return minimalGridVariations(page, photos);
    }
  })();

  return rawVariations.map((elements, variationIndex) => ({
    elements: elements.filter((element) => element.type === "text" || element.photo),
    layout_type: system.toUpperCase() as Uppercase<StoryLayoutSystem>,
    style: {
      background: familyBackground(system),
      padding: system === "full_bleed" ? 8 : system === "collage" ? 14 : 18,
      spacing: 16,
    },
    variationIndex,
  }));
}

export function selectStoryLayout(
  page: BookPage,
  photos: PhotoAsset[],
  project: Project,
  _editorState: BookDraftEditorState,
) {
  const system = familyStyle(page, project, photos);
  const variations = buildVariationSet(system, page, photos);
  const variationIndex = hashString(`${page.id}:${system}`) % variations.length;

  return {
    active: variations[variationIndex]!,
    system,
    variationIndex,
    variations,
  };
}

export function getCanvasAspectRatio(formatId: BookDraftFormatId) {
  switch (formatId) {
    case "11x8.5-landscape":
      return 11 / 8.5;
    case "8x8-square":
    case "10x10-square":
    case "12x12-square":
    default:
      return 1;
  }
}

export function normalizeStoryLayoutSystem(style: PageLayoutStyle) {
  return normalizeOldLayout(style);
}
