import type { BookStyleMode, BookTheme } from "@photo-book-maker/core";
import type { CSSProperties } from "react";

type ThemePalette = {
  appGradient: string;
  canvasGradient: string;
  chromeGradient: string;
  frameGradient: string;
  mutedGradient: string;
  pageGradient: string;
  accent: string;
  accentStrong: string;
  accentText: string;
  ink: string;
  mutedInk: string;
};

export type BookThemePresentation = {
  appStyle: CSSProperties;
  canvasFrameStyle: CSSProperties;
  canvasStyle: CSSProperties;
  chromeStyle: CSSProperties;
  mutedPanelStyle: CSSProperties;
  panelStyle: CSSProperties;
  pagerActiveStyle: CSSProperties;
  primaryButtonStyle: CSSProperties;
  secondaryButtonStyle: CSSProperties;
  subtleBorder: string;
  textColor: string;
  textMuted: string;
};

const THEME_PALETTES: Record<string, ThemePalette> = {
  "golden-hour": {
    appGradient:
      "linear-gradient(180deg, rgba(255,248,242,0.98) 0%, rgba(244,231,219,0.96) 100%)",
    canvasGradient:
      "linear-gradient(180deg, rgba(255,252,247,0.98) 0%, rgba(244,232,221,0.96) 100%)",
    chromeGradient:
      "linear-gradient(145deg, rgba(255,247,239,0.98) 0%, rgba(243,228,214,0.95) 100%)",
    frameGradient:
      "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,237,228,0.95) 100%)",
    mutedGradient:
      "linear-gradient(180deg, rgba(255,250,245,0.98) 0%, rgba(247,238,231,0.94) 100%)",
    pageGradient:
      "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(247,238,230,0.96) 100%)",
    accent: "#c76c3a",
    accentStrong: "#9d4f24",
    accentText: "#7f3f17",
    ink: "#201712",
    mutedInk: "#665750",
  },
  "pine-ink": {
    appGradient:
      "linear-gradient(180deg, rgba(244,250,246,0.98) 0%, rgba(228,238,234,0.96) 100%)",
    canvasGradient:
      "linear-gradient(180deg, rgba(251,255,253,0.98) 0%, rgba(233,242,239,0.95) 100%)",
    chromeGradient:
      "linear-gradient(145deg, rgba(245,251,248,0.98) 0%, rgba(227,238,234,0.95) 100%)",
    frameGradient:
      "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(236,244,241,0.95) 100%)",
    mutedGradient:
      "linear-gradient(180deg, rgba(246,252,249,0.98) 0%, rgba(236,244,241,0.95) 100%)",
    pageGradient:
      "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(238,245,242,0.96) 100%)",
    accent: "#335c52",
    accentStrong: "#25453d",
    accentText: "#214039",
    ink: "#13211d",
    mutedInk: "#556560",
  },
  coastline: {
    appGradient:
      "linear-gradient(180deg, rgba(245,248,253,0.98) 0%, rgba(229,236,245,0.96) 100%)",
    canvasGradient:
      "linear-gradient(180deg, rgba(252,254,255,0.98) 0%, rgba(235,240,248,0.95) 100%)",
    chromeGradient:
      "linear-gradient(145deg, rgba(247,250,255,0.98) 0%, rgba(229,236,244,0.95) 100%)",
    frameGradient:
      "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(237,242,248,0.95) 100%)",
    mutedGradient:
      "linear-gradient(180deg, rgba(248,250,254,0.98) 0%, rgba(238,242,248,0.94) 100%)",
    pageGradient:
      "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(238,242,249,0.96) 100%)",
    accent: "#6a7ea8",
    accentStrong: "#4f638c",
    accentText: "#435a84",
    ink: "#182033",
    mutedInk: "#5b6478",
  },
};

function withAlpha(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized;

  const [red, green, blue] = [0, 2, 4].map((offset) =>
    Number.parseInt(expanded.slice(offset, offset + 2), 16),
  );

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getModeBorder(styleMode: BookStyleMode, accent: string) {
  switch (styleMode) {
    case "warm_scrapbook":
      return withAlpha(accent, 0.22);
    case "clean_modern":
      return "rgba(31, 24, 20, 0.08)";
    case "bold_travel":
      return withAlpha(accent, 0.28);
    case "timeless_yearbook":
      return withAlpha(accent, 0.16);
    case "minimal_editorial":
    default:
      return withAlpha(accent, 0.18);
  }
}

export function getBookThemePresentation(
  theme: BookTheme | undefined,
  styleMode: BookStyleMode,
): BookThemePresentation {
  const palette =
    (theme ? THEME_PALETTES[theme.id] : undefined) ?? THEME_PALETTES["golden-hour"];
  const borderColor = getModeBorder(styleMode, palette.accent);

  return {
    appStyle: {
      background: palette.appGradient,
      border: `1px solid ${withAlpha(palette.accent, 0.12)}`,
      color: palette.ink,
      boxShadow: `0 20px 64px ${withAlpha(palette.accentStrong, 0.08)}`,
    },
    canvasFrameStyle: {
      background: palette.frameGradient,
      border: `1px solid ${withAlpha(palette.accent, 0.14)}`,
      boxShadow: `0 28px 72px ${withAlpha(palette.accentStrong, 0.11)}`,
    },
    canvasStyle: {
      background: palette.canvasGradient,
      border: `1px solid ${borderColor}`,
      boxShadow: `inset 0 0 0 1px ${withAlpha(palette.accent, 0.08)}`,
    },
    chromeStyle: {
      background: palette.chromeGradient,
      border: `1px solid ${withAlpha(palette.accent, 0.16)}`,
      boxShadow: `0 14px 36px ${withAlpha(palette.accentStrong, 0.08)}`,
    },
    mutedPanelStyle: {
      background: palette.mutedGradient,
      border: `1px solid ${withAlpha(palette.accent, 0.12)}`,
    },
    panelStyle: {
      background: palette.pageGradient,
      border: `1px solid ${withAlpha(palette.accent, 0.14)}`,
      boxShadow: `0 12px 34px ${withAlpha(palette.accentStrong, 0.06)}`,
    },
    pagerActiveStyle: {
      background: palette.accentStrong,
      border: `1px solid ${withAlpha(palette.accentStrong, 0.65)}`,
      color: "#fdf8f3",
      boxShadow: `0 10px 24px ${withAlpha(palette.accentStrong, 0.2)}`,
    },
    primaryButtonStyle: {
      background: palette.accentStrong,
      border: `1px solid ${withAlpha(palette.accentStrong, 0.65)}`,
      color: "#fdf8f3",
    },
    secondaryButtonStyle: {
      background: withAlpha(palette.accent, 0.08),
      border: `1px solid ${withAlpha(palette.accent, 0.18)}`,
      color: palette.ink,
    },
    subtleBorder: borderColor,
    textColor: palette.ink,
    textMuted: palette.mutedInk,
  };
}
