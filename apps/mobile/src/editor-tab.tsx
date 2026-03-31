import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Project } from "./core";
import { StorybookPageCanvas } from "./storybook-page-canvas";
import { getStoryLayoutLabel, normalizeStoryLayoutSystem } from "./story-layout-engine";

const palette = {
  accent: "#c36d3f",
  accentSoft: "#f2dfd1",
  bg: "#f4ede5",
  card: "rgba(255,251,246,0.88)",
  forest: "#2e5c4d",
  forestSoft: "#d9ebe3",
  ink: "#1f1814",
  line: "rgba(31, 24, 20, 0.12)",
  muted: "#6f625b",
};

type Props = {
  onExportProof: () => void;
  onThemeSelect: (themeId: string) => void;
  onTogglePage: (pageId: string) => void;
  onUpdatePageCopy: (
    pageId: string,
    input: { caption: string; confirmed?: boolean; title: string },
  ) => void;
  project?: Project;
};

function ActionButton({
  dark,
  label,
  onPress,
}: {
  dark?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.actionButton, dark ? styles.actionButtonDark : null]}
    >
      <Text style={[styles.actionButtonText, dark ? styles.actionButtonTextDark : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function EditorField({
  label,
  multiline,
  onChangeText,
  value,
}: {
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        multiline={multiline}
        onChangeText={onChangeText}
        style={[styles.fieldInput, multiline ? styles.fieldInputMultiline : null]}
        textAlignVertical={multiline ? "top" : "center"}
        value={value}
      />
    </View>
  );
}

function getStoryBeatLabel(page: Project["bookDraft"]["pages"][number]) {
  const beat =
    page.storyBeat ??
    (page.style === "full_bleed" || page.style === "hero"
      ? "opener"
      : page.style === "recap" || page.style === "closing"
        ? "closing"
        : "details");

  return beat.replaceAll("_", " ");
}

function getCopySourceLabel(page: Project["bookDraft"]["pages"][number]) {
  switch (page.copySource) {
    case "hybrid":
      return "Notes + metadata draft";
    case "note":
      return "Note-led draft";
    case "manual":
      return "Manually edited copy";
    default:
      return "Metadata draft";
  }
}

function getProjectAccent(project: Project) {
  return (
    project.bookThemes.find((theme) => theme.id === project.selectedThemeId)?.accent ??
    palette.accent
  );
}

export function MobileEditorTab({
  onExportProof,
  onThemeSelect,
  onTogglePage,
  onUpdatePageCopy,
  project,
}: Props) {
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [pageDrafts, setPageDrafts] = useState<
    Record<string, { caption: string; title: string }>
  >({});

  useEffect(() => {
    if (!project) {
      setPageDrafts({});
      setActivePageIndex(0);
      setSelectedPhotoId(null);
      return;
    }

    setPageDrafts(
      Object.fromEntries(
        project.bookDraft.pages.map((page) => [
          page.id,
          {
            caption: page.caption,
            title: page.title,
          },
        ]),
      ),
    );
    setActivePageIndex(0);
    setSelectedPhotoId(project.bookDraft.pages[0]?.photoIds[0] ?? null);
  }, [project]);

  if (!project) {
    return null;
  }

  const accent = getProjectAccent(project);
  const pages = project.bookDraft.pages;
  const safeIndex = Math.min(activePageIndex, Math.max(0, pages.length - 1));
  const activePage = pages[safeIndex];
  const activeDraft = pageDrafts[activePage.id] ?? {
    caption: activePage.caption,
    title: activePage.title,
  };
  const activePhotos = activePage.photoIds
    .map((photoId) => project.photos.find((photo) => photo.id === photoId))
    .filter((photo): photo is Project["photos"][number] => Boolean(photo));
  const selectedPhoto = activePhotos.find((photo) => photo.id === selectedPhotoId) ?? activePhotos[0];

  useEffect(() => {
    if (!selectedPhotoId && activePhotos[0]?.id) {
      setSelectedPhotoId(activePhotos[0].id);
      return;
    }

    if (selectedPhotoId && !activePhotos.some((photo) => photo.id === selectedPhotoId)) {
      setSelectedPhotoId(activePhotos[0]?.id ?? null);
    }
  }, [activePhotos, selectedPhotoId]);

  const confirmedCopyCount = useMemo(
    () => project.bookDraft.pages.filter((page) => page.copyStatus === "confirmed").length,
    [project.bookDraft.pages],
  );

  const activeLayoutLabel = getStoryLayoutLabel(normalizeStoryLayoutSystem(activePage.style));

  return (
    <View style={styles.sectionStack}>
      <View style={styles.surfaceCard}>
        <Text style={styles.cardEyebrow}>Professional proofing</Text>
        <Text style={styles.cardTitle}>{project.title} draft editor</Text>
        <Text style={styles.cardBody}>
          The phone editor now uses the same constrained layout families as the web draft:
          one spread at a time, photo-first composition, and cleaner proof exports.
        </Text>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{pages.length}</Text>
            <Text style={styles.summaryLabel}>Curated spreads</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{confirmedCopyCount}</Text>
            <Text style={styles.summaryLabel}>Copy confirmed</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{pages.length - confirmedCopyCount}</Text>
            <Text style={styles.summaryLabel}>Needs review</Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.themeRow}
        >
          {project.bookThemes.map((theme) => (
            <Pressable
              key={theme.id}
              onPress={() => onThemeSelect(theme.id)}
              style={[
                styles.themeChip,
                project.selectedThemeId === theme.id
                  ? [styles.themeChipActive, { borderColor: `${theme.accent}55` }]
                  : null,
              ]}
            >
              <Text style={styles.themeChipTitle}>{theme.name}</Text>
              <Text style={styles.themeChipBody}>{theme.mood}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <ActionButton label="Export proof PDF" onPress={onExportProof} />
      </View>

      <View style={styles.surfaceCard}>
        <View style={styles.pageHeader}>
          <View style={styles.pageHeaderCopy}>
            <Text style={styles.cardEyebrow}>
              Spread {safeIndex + 1} of {pages.length}
            </Text>
            <Text style={styles.pageTitle}>{activeLayoutLabel}</Text>
            <Text style={styles.pageMeta}>
              {getStoryBeatLabel(activePage)} · {getCopySourceLabel(activePage)}
            </Text>
          </View>
          <Pressable
            style={[
              styles.approveButton,
              activePage.approved ? styles.approveButtonActive : null,
            ]}
            onPress={() => onTogglePage(activePage.id)}
          >
            <Text
              style={[
                styles.approveButtonText,
                activePage.approved ? styles.approveButtonTextActive : null,
              ]}
            >
              {activePage.approved ? "Approved" : "Approve"}
            </Text>
          </Pressable>
        </View>

        <StorybookPageCanvas
          accent={accent}
          onSelectPhoto={setSelectedPhotoId}
          page={activePage}
          photos={activePhotos}
          project={project}
          selectedPhotoId={selectedPhoto?.id}
        />

        <View style={styles.pageControls}>
          <ActionButton
            label="Previous"
            onPress={() => setActivePageIndex((current) => Math.max(0, current - 1))}
          />
          <View style={styles.pageCounter}>
            <Text style={styles.pageCounterText}>
              {safeIndex + 1}/{pages.length}
            </Text>
            <Text style={styles.pageCounterSubtext}>Flip through the book one spread at a time</Text>
          </View>
          <ActionButton
            label="Next"
            onPress={() =>
              setActivePageIndex((current) => Math.min(pages.length - 1, current + 1))
            }
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pagerRow}
        >
          {pages.map((page, index) => (
            <Pressable
              key={page.id}
              onPress={() => setActivePageIndex(index)}
              style={[
                styles.pagerChip,
                index === safeIndex ? [styles.pagerChipActive, { borderColor: `${accent}44` }] : null,
              ]}
            >
              <Text
                style={[
                  styles.pagerChipText,
                  index === safeIndex ? [styles.pagerChipTextActive, { color: accent }] : null,
                ]}
              >
                {index + 1}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <EditorField
          label="Spread headline"
          onChangeText={(value) =>
            setPageDrafts((current) => ({
              ...current,
              [activePage.id]: {
                ...(current[activePage.id] ?? {
                  caption: activePage.caption,
                  title: activePage.title,
                }),
                title: value,
              },
            }))
          }
          value={activeDraft.title}
        />
        <EditorField
          label="Spread caption"
          multiline
          onChangeText={(value) =>
            setPageDrafts((current) => ({
              ...current,
              [activePage.id]: {
                ...(current[activePage.id] ?? {
                  caption: activePage.caption,
                  title: activePage.title,
                }),
                caption: value,
              },
            }))
          }
          value={activeDraft.caption}
        />

        <View style={styles.copyActionRow}>
          <ActionButton
            dark
            label="Save draft copy"
            onPress={() =>
              onUpdatePageCopy(activePage.id, {
                caption: activeDraft.caption,
                title: activeDraft.title,
              })
            }
          />
          <ActionButton
            label={activePage.copyStatus === "confirmed" ? "Refresh confirmed copy" : "Confirm copy"}
            onPress={() =>
              onUpdatePageCopy(activePage.id, {
                caption: activeDraft.caption,
                confirmed: true,
                title: activeDraft.title,
              })
            }
          />
        </View>

        {selectedPhoto ? (
          <View style={styles.selectedPhotoCard}>
            <View style={styles.selectedPhotoCopy}>
              <Text style={styles.cardEyebrow}>Selected photo</Text>
              <Text style={styles.selectedPhotoTitle}>{selectedPhoto.title}</Text>
              <Text style={styles.selectedPhotoBody}>
                {selectedPhoto.locationLabel ?? "Location still missing"} · {selectedPhoto.orientation}
              </Text>
            </View>
            {selectedPhoto.imageUri ? (
              <Image source={{ uri: selectedPhoto.imageUri }} style={styles.selectedPhotoThumb} />
            ) : null}
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photoStrip}
        >
          {activePhotos.map((photo) => (
            <Pressable
              key={photo.id}
              onPress={() => setSelectedPhotoId(photo.id)}
              style={[
                styles.photoCard,
                photo.id === selectedPhoto?.id ? [styles.photoCardSelected, { borderColor: `${accent}55` }] : null,
              ]}
            >
              {photo.imageUri ? (
                <Image source={{ uri: photo.imageUri }} style={styles.photoThumb} />
              ) : (
                <View style={styles.photoFallback}>
                  <Text style={styles.photoFallbackText}>{photo.orientation}</Text>
                </View>
              )}
              <Text numberOfLines={2} style={styles.photoTitle}>
                {photo.title}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Curation note</Text>
          <Text style={styles.noteBody}>{activePage.curationNote ?? activePage.layoutNote}</Text>
          <Text style={styles.noteBodyMuted}>{activePage.layoutNote}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionStack: {
    gap: 16,
  },
  surfaceCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.card,
    padding: 18,
    gap: 14,
  },
  cardEyebrow: {
    fontSize: 11,
    letterSpacing: 1.7,
    textTransform: "uppercase",
    fontWeight: "700",
    color: palette.muted,
  },
  cardTitle: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "700",
    color: palette.ink,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 22,
    color: palette.muted,
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    minWidth: 94,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.76)",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 3,
  },
  summaryValue: {
    fontSize: 24,
    lineHeight: 27,
    fontWeight: "700",
    color: palette.ink,
  },
  summaryLabel: {
    fontSize: 12,
    lineHeight: 18,
    color: palette.muted,
  },
  themeRow: {
    gap: 10,
    paddingRight: 8,
  },
  themeChip: {
    width: 170,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.72)",
    padding: 14,
    gap: 4,
  },
  themeChipActive: {
    backgroundColor: "#fff6ef",
  },
  themeChipTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: palette.ink,
  },
  themeChipBody: {
    fontSize: 13,
    lineHeight: 19,
    color: palette.muted,
  },
  actionButton: {
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#fff8f3",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  actionButtonDark: {
    backgroundColor: palette.forest,
    borderColor: palette.forest,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.ink,
  },
  actionButtonTextDark: {
    color: "#fffaf5",
  },
  pageHeader: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  pageHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  pageTitle: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "700",
    color: palette.ink,
  },
  pageMeta: {
    fontSize: 13,
    lineHeight: 20,
    color: palette.muted,
    textTransform: "capitalize",
  },
  approveButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  approveButtonActive: {
    backgroundColor: palette.forestSoft,
    borderColor: "rgba(46, 92, 77, 0.28)",
  },
  approveButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.ink,
  },
  approveButtonTextActive: {
    color: palette.forest,
  },
  pageControls: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  pageCounter: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  pageCounterText: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.ink,
  },
  pageCounterSubtext: {
    fontSize: 11,
    color: palette.muted,
  },
  pagerRow: {
    gap: 8,
    paddingRight: 8,
  },
  pagerChip: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.76)",
  },
  pagerChipActive: {
    backgroundColor: palette.accentSoft,
  },
  pagerChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.muted,
  },
  pagerChipTextActive: {
    color: palette.accent,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontWeight: "700",
    color: palette.muted,
  },
  fieldInput: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.82)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: palette.ink,
    fontSize: 16,
  },
  fieldInputMultiline: {
    minHeight: 110,
  },
  copyActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  selectedPhotoCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.76)",
    padding: 14,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  selectedPhotoCopy: {
    flex: 1,
    gap: 4,
  },
  selectedPhotoTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
    color: palette.ink,
  },
  selectedPhotoBody: {
    fontSize: 13,
    lineHeight: 19,
    color: palette.muted,
  },
  selectedPhotoThumb: {
    width: 84,
    height: 84,
    borderRadius: 18,
    backgroundColor: "#e7ddd2",
  },
  photoStrip: {
    gap: 10,
    paddingRight: 10,
  },
  photoCard: {
    width: 118,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.82)",
    padding: 8,
    gap: 8,
  },
  photoCardSelected: {
    backgroundColor: "#fff6ef",
  },
  photoThumb: {
    width: "100%",
    height: 98,
    borderRadius: 14,
    backgroundColor: "#e7ddd2",
  },
  photoFallback: {
    width: "100%",
    height: 98,
    borderRadius: 14,
    backgroundColor: palette.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  photoFallbackText: {
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontWeight: "700",
    color: palette.accent,
  },
  photoTitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: palette.ink,
  },
  noteCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.76)",
    padding: 14,
    gap: 6,
  },
  noteTitle: {
    fontSize: 13,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontWeight: "700",
    color: palette.muted,
  },
  noteBody: {
    fontSize: 14,
    lineHeight: 22,
    color: palette.ink,
  },
  noteBodyMuted: {
    fontSize: 13,
    lineHeight: 20,
    color: palette.muted,
  },
});
