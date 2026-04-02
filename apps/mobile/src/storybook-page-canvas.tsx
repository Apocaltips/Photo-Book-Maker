import { memo } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import type { BookPage, PhotoAsset, Project } from "./core";
import {
  getCanvasAspectRatio,
  mapBookFormatToLayoutFormat,
  selectStoryLayout,
} from "./story-layout-engine";

const canvasPalette = {
  ink: "#1f1814",
  line: "rgba(31, 24, 20, 0.08)",
  muted: "#75665e",
  overlayText: "#fff7ef",
  overlayMuted: "#f1dfd1",
  card: "rgba(255,255,255,0.94)",
};

function buildThemeSurface(project: Project, accent: string) {
  switch (project.selectedThemeId) {
    case "pine-ink":
      return {
        canvas: "#eef2ed",
        textMuted: "#52655d",
        textPrimary: "#19312a",
        textCard: "rgba(241,247,243,0.96)",
      };
    case "coastline":
      return {
        canvas: "#eff3f8",
        textMuted: "#60718a",
        textPrimary: "#233249",
        textCard: "rgba(248,250,253,0.96)",
      };
    default:
      return {
        canvas: "#f8f2ea",
        textMuted: "#7e6658",
        textPrimary: accent || "#5d2e18",
        textCard: "rgba(255,251,246,0.96)",
      };
  }
}

function PhotoLayer({
  accent,
  isSelected,
  onPress,
  photo,
  style,
  variant,
}: {
  accent: string;
  isSelected: boolean;
  onPress?: () => void;
  photo?: PhotoAsset;
  style: ViewStyle;
  variant?: "hero" | "support";
}) {
  const content = (
    <View
      style={[
        styles.imageFrame,
        style,
        isSelected
          ? {
              borderColor: `${accent}88`,
              borderWidth: 2,
              shadowColor: accent,
              shadowOpacity: 0.22,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 8 },
              elevation: 6,
            }
          : null,
      ]}
    >
      {photo?.imageUri ? (
        <Image source={{ uri: photo.imageUri }} resizeMode="cover" style={styles.imageFill} />
      ) : (
        <View style={styles.placeholderFill}>
          <Text style={styles.placeholderText}>Missing photo</Text>
        </View>
      )}
      <View
        style={[
          styles.imageWash,
          variant === "hero" ? styles.heroImageWash : styles.supportImageWash,
        ]}
      />
      {isSelected ? (
        <View style={[styles.selectedPill, { borderColor: `${accent}2d` }]}>
          <Text style={[styles.selectedPillText, { color: accent }]}>Selected</Text>
        </View>
      ) : null}
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable onPress={onPress} style={style}>
      {content}
    </Pressable>
  );
}

function TextLayer({
  surfaceColor,
  style,
  textColor,
  textMuted,
  variant,
  body,
  eyebrow,
  title,
}: {
  body?: string;
  eyebrow?: string;
  style: ViewStyle;
  surfaceColor: string;
  textColor: string;
  textMuted: string;
  title?: string;
  variant: "card" | "overlay" | "strip";
}) {
  const isOverlay = variant === "overlay";
  const backgroundStyle =
    variant === "strip"
      ? styles.textStrip
      : isOverlay
        ? styles.textOverlay
        : [styles.textCard, { backgroundColor: surfaceColor }];
  const contentStyle =
    variant === "overlay"
      ? styles.textLayerOverlay
      : variant === "strip"
        ? styles.textLayerStrip
        : styles.textLayerCard;

  return (
    <View style={[styles.textLayer, contentStyle, style, backgroundStyle]}>
      {eyebrow ? (
        <Text style={[styles.textEyebrow, { color: isOverlay ? canvasPalette.overlayMuted : textMuted }]}>
          {eyebrow}
        </Text>
      ) : null}
      {title ? (
        <Text style={[styles.textTitle, { color: isOverlay ? canvasPalette.overlayText : textColor }]}>
          {title}
        </Text>
      ) : null}
      {body ? (
        <Text style={[styles.textBody, { color: isOverlay ? canvasPalette.overlayMuted : textMuted }]}>
          {body}
        </Text>
      ) : null}
    </View>
  );
}

export const StorybookPageCanvas = memo(function StorybookPageCanvas({
  accent,
  page,
  photos,
  project,
  selectedPhotoId,
  onSelectPhoto,
}: {
  accent: string;
  onSelectPhoto?: (photoId: string) => void;
  page: BookPage;
  photos: PhotoAsset[];
  project: Project;
  selectedPhotoId?: string;
}) {
  const layout = selectStoryLayout(page, photos, project).active;
  const formatId = mapBookFormatToLayoutFormat(project.bookDraft.format);
  const aspectRatio = getCanvasAspectRatio(formatId);
  const themeSurface = buildThemeSurface(project, accent);

  return (
    <View
      style={[
        styles.shell,
        {
          aspectRatio,
          backgroundColor: themeSurface.canvas,
          padding: layout.style.padding,
        },
      ]}
    >
      {layout.elements.map((element) => {
        const elementStyle: ViewStyle = {
          height: `${element.position.h * 100}%`,
          left: `${element.position.x * 100}%`,
          position: "absolute",
          top: `${element.position.y * 100}%`,
          width: `${element.position.w * 100}%`,
          zIndex: element.zIndex,
        };

        if (element.type === "image") {
          const photoId = element.photo?.id;
          return (
            <PhotoLayer
              key={element.id}
              accent={accent}
              isSelected={photoId === selectedPhotoId}
              onPress={photoId && onSelectPhoto ? () => onSelectPhoto(photoId) : undefined}
              photo={element.photo}
              style={elementStyle}
              variant={element.variant}
            />
          );
        }

        return (
          <TextLayer
            key={element.id}
            body={element.body}
            eyebrow={element.eyebrow}
            style={elementStyle}
            surfaceColor={themeSurface.textCard}
            textColor={themeSurface.textPrimary}
            textMuted={themeSurface.textMuted}
            title={element.title}
            variant={element.variant}
          />
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  shell: {
    width: "100%",
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: canvasPalette.line,
    backgroundColor: "#faf6f2",
  },
  imageFrame: {
    flex: 1,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.44)",
    backgroundColor: "#e2d7ca",
  },
  imageFill: {
    width: "100%",
    height: "100%",
  },
  placeholderFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eadfd4",
  },
  placeholderText: {
    color: canvasPalette.muted,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  imageWash: {
    ...StyleSheet.absoluteFillObject,
  },
  heroImageWash: {
    backgroundColor: "rgba(18,14,10,0.08)",
  },
  supportImageWash: {
    backgroundColor: "rgba(18,14,10,0.04)",
  },
  selectedPill: {
    position: "absolute",
    right: 10,
    top: 10,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(255,247,241,0.96)",
    borderWidth: 1,
  },
  selectedPillText: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  textLayer: {
    borderRadius: 18,
    justifyContent: "flex-start",
    borderWidth: 1,
  },
  textLayerCard: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  textLayerOverlay: {
    paddingHorizontal: 11,
    paddingVertical: 10,
    gap: 6,
  },
  textLayerStrip: {
    paddingHorizontal: 11,
    paddingVertical: 9,
    gap: 5,
  },
  textCard: {
    borderColor: "rgba(31,24,20,0.08)",
    shadowColor: "#251a14",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  textOverlay: {
    backgroundColor: "rgba(18,14,10,0.46)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  textStrip: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderColor: "rgba(31,24,20,0.06)",
  },
  textEyebrow: {
    fontSize: 10,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  textTitle: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "700",
  },
  textBody: {
    fontSize: 10,
    lineHeight: 14,
    maxWidth: "92%",
  },
});
