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

function normalizeCopy(value?: string | null) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function getStoryBeatToken(page: Pick<BookPage, "storyBeat" | "style">) {
  return (
    page.storyBeat ??
    (page.style === "full_bleed" || page.style === "hero" || page.style === "hero_full_bleed"
      ? "opener"
      : page.style === "recap" || page.style === "closing"
        ? "closing"
        : "details")
  );
}

function buildCopy(
  page: BookPage,
  options?: {
    bodyMax?: number;
    titleWords?: number;
  },
) {
  const title = truncateWords(page.title ?? "", options?.titleWords ?? 5);
  const body = truncateSentence(
    firstSentence(page.caption ?? page.curationNote ?? ""),
    options?.bodyMax ?? 64,
  );
  const eyebrow = sentenceCase(getStoryBeatToken(page).replaceAll("_", " "));
  return { body, eyebrow, title };
}

function firstSentence(value?: string | null) {
  const trimmed = normalizeCopy(value);
  if (!trimmed) {
    return "";
  }

  const match = trimmed.match(/^(.+?[.!?])(?:\s|$)/);
  return match?.[1] ?? trimmed;
}

function sentenceCase(value: string) {
  return value ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}` : value;
}

function truncateSentence(value: string | null | undefined, maxLength: number) {
  const normalized = normalizeCopy(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const clipped = normalized.slice(0, Math.max(0, maxLength - 1));
  return `${clipped.replace(/[,\s]+$/, "")}...`;
}

function truncateWords(value: string | null | undefined, maxWords: number) {
  const normalized = normalizeCopy(value);
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return normalized;
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
  const copy = buildCopy(page, { bodyMax: 58, titleWords: 4 });
  const hero = photos[0];
  const support = photos.slice(1);

  return [
    [
      imageElement("hero", hero, rect(0, 0, support.length ? 0.76 : 1, 1), 1, "hero"),
      textElement("text", rect(0.04, 0.76, support.length ? 0.34 : 0.38, 0.15), copy, "overlay", 2),
      ...(support[0] ? [imageElement("support-1", support[0], rect(0.79, 0.05, 0.21, 0.29), 1)] : []),
      ...(support[1] ? [imageElement("support-2", support[1], rect(0.79, 0.37, 0.21, 0.23), 1)] : []),
      ...(support[2] ? [imageElement("support-3", support[2], rect(0.79, 0.63, 0.21, 0.32), 1)] : []),
    ],
    [
      imageElement("hero", hero, rect(0, 0, 1, support.length ? 0.77 : 1), 1, "hero"),
      textElement("text", rect(0.05, 0.07, 0.3, 0.14), copy, "overlay", 2),
      ...(support[0] ? [imageElement("support-1", support[0], rect(0.05, 0.81, 0.24, 0.19), 1)] : []),
      ...(support[1] ? [imageElement("support-2", support[1], rect(0.31, 0.81, 0.24, 0.19), 1)] : []),
      ...(support[2] ? [imageElement("support-3", support[2], rect(0.57, 0.81, 0.38, 0.19), 1)] : []),
    ],
    [
      imageElement("hero", hero, rect(support.length ? 0.28 : 0, 0, support.length ? 0.72 : 1, 1), 1, "hero"),
      textElement("text", rect(0.03, 0.05, 0.22, 0.16), copy, "card", 2),
      ...(support[0] ? [imageElement("support-1", support[0], rect(0.03, 0.25, 0.22, 0.28), 1)] : []),
      ...(support[1] ? [imageElement("support-2", support[1], rect(0.03, 0.56, 0.22, 0.18), 1)] : []),
      ...(support[2] ? [imageElement("support-3", support[2], rect(0.03, 0.77, 0.22, 0.18), 1)] : []),
    ],
  ];
}

function fullBleedVariations(page: BookPage, photos: PhotoAsset[]) {
  const copy = buildCopy(page, { bodyMax: 52, titleWords: 4 });
  const hero = photos[0];
  const support = photos.slice(1, 3);

  return [
    [
      imageElement("hero", hero, rect(0, 0, 1, 1), 1, "hero"),
      textElement("text", rect(0.05, 0.78, 0.34, 0.14), copy, "overlay", 3),
      ...(support[0] ? [imageElement("support-1", support[0], rect(0.82, 0.75, 0.13, 0.18), 2)] : []),
    ],
    [
      imageElement("hero", hero, rect(0, 0, 1, 1), 1, "hero"),
      textElement("text", rect(0.05, 0.07, 0.3, 0.14), copy, "overlay", 3),
      ...(support[0] ? [imageElement("support-1", support[0], rect(0.74, 0.78, 0.1, 0.14), 2)] : []),
      ...(support[1] ? [imageElement("support-2", support[1], rect(0.86, 0.78, 0.1, 0.14), 2)] : []),
    ],
    [
      imageElement("hero", hero, rect(0, 0, 1, 1), 1, "hero"),
      ...(support[0] ? [imageElement("support-1", support[0], rect(0.05, 0.8, 0.14, 0.15), 2)] : []),
      ...(support[1] ? [imageElement("support-2", support[1], rect(0.81, 0.8, 0.14, 0.15), 2)] : []),
      textElement("text", rect(0.35, 0.79, 0.3, 0.13), copy, "overlay", 3),
    ],
  ];
}

function minimalGridVariations(page: BookPage, photos: PhotoAsset[]) {
  const copy = buildCopy(page, { bodyMax: 46, titleWords: 4 });
  const firstFour = photos.slice(0, 4);
  const count = firstFour.length;

  const v1 =
    count === 1
      ? [
          imageElement("image-0", firstFour[0], rect(0, 0, 1, 1), 1, "hero"),
          textElement("text", rect(0.05, 0.8, 0.32, 0.12), copy, "overlay", 2),
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
          imageElement("image-0", firstFour[0], rect(0, 0, 0.78, 1), 1, "hero"),
          textElement("text", rect(0.81, 0.08, 0.16, 0.18), copy, "card", 2),
        ]
      : count <= 2
      ? [
          imageElement("image-0", firstFour[0], rect(0, 0, 1, 0.63), 1, "hero"),
          imageElement("image-1", firstFour[1], rect(0, 0.67, 1, 0.33), 1),
        ]
      : [
          imageElement("image-0", firstFour[0], rect(0, 0, 0.69, 1), 1, "hero"),
          imageElement("image-1", firstFour[1], rect(0.72, 0, 0.28, 0.31), 1),
          imageElement("image-2", firstFour[2], rect(0.72, 0.34, 0.28, 0.31), 1),
          ...(firstFour[3]
            ? [imageElement("image-3", firstFour[3], rect(0.72, 0.68, 0.28, 0.32), 1)]
            : [textElement("text", rect(0.75, 0.71, 0.22, 0.18), copy, "card", 2)]),
        ];

  const v3 =
    count <= 1
      ? [
          imageElement("image-0", firstFour[0], rect(0, 0, 1, 1), 1, "hero"),
          textElement("text", rect(0.05, 0.07, 0.28, 0.12), copy, "overlay", 2),
        ]
      : [
          imageElement("image-0", firstFour[0], rect(0, 0, 0.56, 0.6), 1, "hero"),
          imageElement("image-1", firstFour[1], rect(0.59, 0, 0.41, 0.6), 1),
          ...(firstFour[2] ? [imageElement("image-2", firstFour[2], rect(0, 0.64, 0.46, 0.36), 1)] : []),
          ...(firstFour[3]
            ? [imageElement("image-3", firstFour[3], rect(0.5, 0.64, 0.5, 0.36), 1)]
            : [textElement("text", rect(0.55, 0.69, 0.24, 0.16), copy, "card", 2)]),
        ];

  return [v1, v2, v3];
}

function collageVariations(page: BookPage, photos: PhotoAsset[]) {
  const copy = buildCopy(page, { bodyMax: 42, titleWords: 4 });
  const visible = photos.slice(0, 8);

  return [
    [
      ...visible.slice(0, 6).map((photo, index) => {
        const positions = [
          rect(0, 0, 0.5, 0.62),
          rect(0.52, 0, 0.22, 0.26),
          rect(0.76, 0, 0.24, 0.26),
          rect(0.52, 0.29, 0.48, 0.33),
          rect(0, 0.66, 0.23, 0.34),
          rect(0.25, 0.66, 0.25, 0.34),
        ];
        return imageElement(`image-${index}`, photo, positions[index]!, 1, index === 0 ? "hero" : "support");
      }),
      textElement("text", rect(0.53, 0.69, 0.2, 0.14), copy, "overlay", 2),
      ...(visible[6] ? [imageElement("image-6", visible[6], rect(0.75, 0.66, 0.25, 0.34), 1)] : []),
    ],
    [
      ...visible.slice(0, 7).map((photo, index) => {
        const positions = [
          rect(0, 0, 0.28, 0.32),
          rect(0.3, 0, 0.28, 0.32),
          rect(0.6, 0, 0.4, 0.56),
          rect(0, 0.35, 0.28, 0.31),
          rect(0.3, 0.35, 0.28, 0.31),
          rect(0, 0.69, 0.46, 0.31),
          rect(0.49, 0.59, 0.19, 0.41),
        ];
        return imageElement(`image-${index}`, photo, positions[index]!, 1, index === 2 ? "hero" : "support");
      }),
      textElement("text", rect(0.72, 0.63, 0.23, 0.14), copy, "overlay", 2),
    ],
    [
      ...visible.slice(0, 5).map((photo, index) => {
        const positions = [
          rect(0, 0, 0.64, 0.64),
          rect(0.67, 0, 0.33, 0.31),
          rect(0.67, 0.33, 0.33, 0.31),
          rect(0, 0.68, 0.31, 0.32),
          rect(0.33, 0.68, 0.31, 0.32),
        ];
        return imageElement(`image-${index}`, photo, positions[index]!, 1, index === 0 ? "hero" : "support");
      }),
      textElement("text", rect(0.69, 0.7, 0.22, 0.14), copy, "overlay", 2),
      ...(visible[5] ? [imageElement("image-5", visible[5], rect(0.84, 0.68, 0.16, 0.32), 1)] : []),
    ],
  ];
}

function coupleStoryVariations(page: BookPage, photos: PhotoAsset[]) {
  const copy = buildCopy(page, { bodyMax: 72, titleWords: 5 });
  const hero = photos[0];
  const support = photos.slice(1, 3);

  return [
    [
      imageElement("hero", hero, rect(0, 0, 0.7, 1), 1, "hero"),
      ...(support[0] ? [imageElement("support-1", support[0], rect(0.73, 0.06, 0.27, 0.28), 1)] : []),
      ...(support[1] ? [imageElement("support-2", support[1], rect(0.73, 0.38, 0.27, 0.2), 1)] : []),
      textElement("text", rect(0.73, support[1] ? 0.63 : 0.42, 0.24, support[1] ? 0.18 : 0.2), copy, "card", 2),
    ],
    [
      imageElement("hero", hero, rect(0, 0, 1, 0.72), 1, "hero"),
      textElement("text", rect(0.05, 0.77, 0.31, 0.15), copy, "card", 2),
      ...(support[0] ? [imageElement("support-1", support[0], rect(0.41, 0.77, 0.26, 0.23), 1)] : []),
      ...(support[1] ? [imageElement("support-2", support[1], rect(0.71, 0.77, 0.24, 0.23), 1)] : []),
    ],
    [
      imageElement("hero", hero, rect(0.34, 0, 0.66, 1), 1, "hero"),
      textElement("text", rect(0.03, 0.06, 0.24, 0.18), copy, "card", 2),
      ...(support[0] ? [imageElement("support-1", support[0], rect(0.03, 0.29, 0.24, 0.28), 1)] : []),
      ...(support[1] ? [imageElement("support-2", support[1], rect(0.03, 0.62, 0.24, 0.22), 1)] : []),
    ],
  ];
}

function familyRecapVariations(page: BookPage, photos: PhotoAsset[]) {
  const copy = buildCopy(page, { bodyMax: 50, titleWords: 4 });
  const visible = photos.slice(0, 6);

  return [
    [
      imageElement("hero", visible[0], rect(0, 0, 1, 0.58), 1, "hero"),
      textElement("text", rect(0.05, 0.44, 0.28, 0.12), copy, "overlay", 2),
      ...visible.slice(1, 5).map((photo, index) =>
        imageElement(`image-${index + 1}`, photo, rect(index * 0.25, 0.64, 0.22, 0.36), 1),
      ),
    ],
    [
      imageElement("hero", visible[0], rect(0, 0, 0.62, 1), 1, "hero"),
      textElement("text", rect(0.05, 0.78, 0.26, 0.13), copy, "overlay", 2),
      ...visible.slice(1, 5).map((photo, index) =>
        imageElement(
          `image-${index + 1}`,
          photo,
          rect(0.66 + (index % 2) * 0.17, 0.04 + Math.floor(index / 2) * 0.25, 0.16, 0.21),
          1,
        ),
      ),
    ],
    [
      ...visible.slice(0, 4).map((photo, index) =>
        imageElement(
          `image-${index}`,
          photo,
          [
            rect(0, 0, 0.49, 0.62),
            rect(0.51, 0, 0.49, 0.62),
            rect(0, 0.66, 0.31, 0.34),
            rect(0.33, 0.66, 0.31, 0.34),
          ][index]!,
          1,
          index <= 1 ? "hero" : "support",
        ),
      ),
      ...(visible[4] ? [imageElement("image-4", visible[4], rect(0.67, 0.66, 0.33, 0.34), 1)] : []),
      textElement("text", rect(0.7, 0.06, 0.22, 0.12), copy, "overlay", 2),
    ],
  ];
}

function timelineVariations(page: BookPage, photos: PhotoAsset[]) {
  const copy = buildCopy(page, { bodyMax: 54, titleWords: 4 });
  const visible = photos.slice(0, 4);

  return [
    [
      textElement("text-0", rect(0.02, 0.04, 0.16, 0.14), copy, "card", 2),
      imageElement("image-0", visible[0], rect(0.22, 0, 0.78, 0.34), 1, "hero"),
      ...(visible[1]
        ? [imageElement("image-1", visible[1], rect(0, 0.4, 0.46, 0.26), 1)]
        : []),
      textElement("text-2", rect(0.52, 0.42, 0.42, 0.1), copy, "strip", 2),
      ...(visible[2]
        ? [imageElement("image-2", visible[2], rect(0.52, 0.58, 0.48, 0.42), 1)]
        : []),
      ...(visible[3]
        ? [imageElement("image-3", visible[3], rect(0, 0.68, 0.48, 0.32), 1)]
        : []),
    ],
    [
      imageElement("image-0", visible[0], rect(0, 0, 1, 0.46), 1, "hero"),
      textElement("text-0", rect(0.06, 0.5, 0.36, 0.1), copy, "strip", 2),
      ...(visible[1]
        ? [imageElement("image-1", visible[1], rect(0, 0.64, 0.49, 0.36), 1)]
        : []),
      ...(visible[2]
        ? [imageElement("image-2", visible[2], rect(0.51, 0.64, 0.49, 0.36), 1)]
        : []),
      ...(visible[3] ? [imageElement("image-3", visible[3], rect(0.78, 0.5, 0.17, 0.1), 1)] : []),
    ],
    [
      textElement("text-0", rect(0.02, 0.03, 0.22, 0.13), copy, "card", 2),
      imageElement("image-0", visible[0], rect(0.28, 0, 0.72, 0.52), 1, "hero"),
      ...(visible[1]
        ? [imageElement("image-1", visible[1], rect(0.02, 0.21, 0.22, 0.33), 1)]
        : []),
      ...(visible[2]
        ? [imageElement("image-2", visible[2], rect(0.28, 0.58, 0.34, 0.42), 1)]
        : []),
      ...(visible[3]
        ? [imageElement("image-3", visible[3], rect(0.66, 0.58, 0.34, 0.42), 1)]
        : []),
      textElement("text-3", rect(0.7, 0.08, 0.22, 0.1), copy, "overlay", 2),
    ],
  ];
}

function captionVariations(page: BookPage, photos: PhotoAsset[]) {
  const copy = buildCopy(page, { bodyMax: 70, titleWords: 5 });
  const hero = photos[0];
  const support = photos[1];

  return [
    [
      imageElement("hero", hero, rect(0, 0, 0.78, 1), 1, "hero"),
      textElement("text", rect(0.81, 0.08, 0.16, 0.2), copy, "card", 2),
      ...(support ? [imageElement("support", support, rect(0.81, 0.34, 0.16, 0.25), 1)] : []),
    ],
    [
      imageElement("hero", hero, rect(0, 0, 1, 0.76), 1, "hero"),
      textElement("text", rect(0.05, 0.8, support ? 0.34 : 0.42, 0.14), copy, "card", 2),
      ...(support ? [imageElement("support", support, rect(0.52, 0.76, 0.48, 0.24), 1)] : []),
    ],
    [
      imageElement("hero", hero, rect(0.22, 0, 0.78, 1), 1, "hero"),
      textElement("text", rect(0.03, 0.08, 0.15, 0.18), copy, "card", 2),
      ...(support ? [imageElement("support", support, rect(0.03, 0.32, 0.15, 0.24), 1)] : []),
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
      padding: system === "full_bleed" ? 8 : system === "collage" ? 12 : 16,
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
