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

type InspectorTab = "book" | "spread" | "copy" | "photo";

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

function MetricPill({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <View style={styles.metricPill}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function TabButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tabButton, active ? styles.tabButtonActive : null]}
    >
      <Text style={[styles.tabButtonText, active ? styles.tabButtonTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function formatStoryBeat(value?: string | null) {
  return String(value ?? "details").split("_").join(" ");
}

function getStoryBeatLabel(page: Project["bookDraft"]["pages"][number]) {
  const beat =
    page.storyBeat ??
    (page.style === "full_bleed" || page.style === "hero"
      ? "opener"
      : page.style === "recap" || page.style === "closing"
        ? "closing"
        : "details");

  return formatStoryBeat(beat);
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

function getCopyStatusLabel(page: Project["bookDraft"]["pages"][number]) {
  return page.copyStatus === "confirmed" ? "Copy confirmed" : "Needs copy review";
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
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("spread");

  useEffect(() => {
    if (!project) {
      setPageDrafts({});
      setActivePageIndex(0);
      setSelectedPhotoId(null);
      setInspectorTab("spread");
      return;
    }

    setPageDrafts(
      Object.fromEntries(
        project.bookDraft.pages.map((page) => [
          page.id,
          {
            caption: page.caption ?? "",
            title: page.title ?? "",
          },
        ]),
      ),
    );
    setActivePageIndex(0);
    setSelectedPhotoId(project.bookDraft.pages[0]?.photoIds[0] ?? null);
    setInspectorTab("spread");
  }, [project]);

  if (!project) {
    return null;
  }

  const accent = getProjectAccent(project);
  const pages = project.bookDraft.pages;
  const safeIndex = Math.min(activePageIndex, Math.max(0, pages.length - 1));
  const activePage = pages[safeIndex];
  const activeDraft = pageDrafts[activePage.id] ?? {
    caption: activePage.caption ?? "",
    title: activePage.title ?? "",
  };
  const selectedTheme =
    project.bookThemes.find((theme) => theme.id === project.selectedThemeId) ??
    project.bookThemes[0];
  const activePhotos = activePage.photoIds
    .map((photoId) => project.photos.find((photo) => photo.id === photoId))
    .filter((photo): photo is Project["photos"][number] => Boolean(photo));
  const selectedPhoto =
    activePhotos.find((photo) => photo.id === selectedPhotoId) ?? activePhotos[0];

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
  const approvedPageCount = useMemo(
    () => project.bookDraft.pages.filter((page) => page.approved).length,
    [project.bookDraft.pages],
  );
  const activeLayoutLabel = getStoryLayoutLabel(normalizeStoryLayoutSystem(activePage.style));

  return (
    <View style={styles.sectionStack}>
      <View style={styles.workspaceCard}>
        <View style={styles.workspaceHeader}>
          <View style={styles.workspaceCopy}>
            <Text style={styles.cardEyebrow}>Layout workspace</Text>
            <Text style={styles.workspaceTitle}>{project.title}</Text>
            <Text style={styles.workspaceBody}>
              Page through one spread at a time, then use the tabs below to change the
              book system, page review, copy, or current photos.
            </Text>
          </View>
          <ActionButton label="Export proof" onPress={onExportProof} />
        </View>

        <View style={styles.metricRow}>
          <MetricPill label="Spreads" value={pages.length} />
          <MetricPill label="Approved" value={approvedPageCount} />
          <MetricPill label="Copy locked" value={confirmedCopyCount} />
          <MetricPill label="Theme" value={selectedTheme?.name ?? "Default"} />
        </View>
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
          onSelectPhoto={(photoId) => {
            setSelectedPhotoId(photoId);
            setInspectorTab("photo");
          }}
          page={activePage}
          photos={activePhotos}
          project={project}
          selectedPhotoId={selectedPhoto?.id}
        />

        <View style={styles.pageControls}>
          <ActionButton
            label="Previous"
            onPress={() => {
              setActivePageIndex((current) => Math.max(0, current - 1));
              setInspectorTab("spread");
            }}
          />
          <View style={styles.pageCounter}>
            <Text style={styles.pageCounterText}>
              {safeIndex + 1}/{pages.length}
            </Text>
            <Text style={styles.pageCounterSubtext}>Flip through the proof one spread at a time</Text>
          </View>
          <ActionButton
            label="Next"
            onPress={() => {
              setActivePageIndex((current) => Math.min(pages.length - 1, current + 1));
              setInspectorTab("spread");
            }}
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
              onPress={() => {
                setActivePageIndex(index);
                setInspectorTab("spread");
              }}
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
      </View>

      <View style={styles.surfaceCard}>
        <View style={styles.inspectorHeader}>
          <View style={styles.inspectorHeaderCopy}>
            <Text style={styles.cardEyebrow}>Editor controls</Text>
            <Text style={styles.inspectorTitle}>
              {inspectorTab === "book"
                ? "Book system"
                : inspectorTab === "spread"
                  ? "Spread review"
                  : inspectorTab === "copy"
                    ? "Copy edits"
                    : "Photo review"}
            </Text>
          </View>
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>{getCopyStatusLabel(activePage)}</Text>
          </View>
        </View>

        <View style={styles.tabGrid}>
          <TabButton
            active={inspectorTab === "book"}
            label="Book"
            onPress={() => setInspectorTab("book")}
          />
          <TabButton
            active={inspectorTab === "spread"}
            label="Spread"
            onPress={() => setInspectorTab("spread")}
          />
          <TabButton
            active={inspectorTab === "copy"}
            label="Copy"
            onPress={() => setInspectorTab("copy")}
          />
          <TabButton
            active={inspectorTab === "photo"}
            label={`Photos ${activePhotos.length ? `(${activePhotos.length})` : ""}`}
            onPress={() => setInspectorTab("photo")}
          />
        </View>

        {inspectorTab === "book" ? (
          <View style={styles.tabSection}>
            <View style={styles.inlineInfoCard}>
              <Text style={styles.inlineInfoTitle}>Theme direction</Text>
              <Text style={styles.inlineInfoBody}>
                Tap a theme to restyle the spread canvas and proof export without changing
                the story order.
              </Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.themeRow}
            >
              {project.bookThemes.map((theme) => {
                const isActive = project.selectedThemeId === theme.id;
                return (
                  <Pressable
                    key={theme.id}
                    onPress={() => onThemeSelect(theme.id)}
                    style={[
                      styles.themeChip,
                      isActive ? [styles.themeChipActive, { borderColor: `${theme.accent}55` }] : null,
                    ]}
                  >
                    <View style={[styles.themeSwatch, { backgroundColor: theme.accent }]} />
                    <View style={styles.themeChipCopy}>
                      <Text style={styles.themeChipTitle}>{theme.name}</Text>
                      <Text numberOfLines={2} style={styles.themeChipBody}>
                        {theme.mood}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.inlineInfoCard}>
              <Text style={styles.inlineInfoTitle}>Current proof setup</Text>
              <Text style={styles.inlineInfoBody}>
                {selectedTheme?.typeface ?? "Editorial serif"} · {project.bookDraft.summary}
              </Text>
            </View>
          </View>
        ) : null}

        {inspectorTab === "spread" ? (
          <View style={styles.tabSection}>
            <View style={styles.detailGrid}>
              <View style={styles.detailCard}>
                <Text style={styles.detailLabel}>Story beat</Text>
                <Text style={styles.detailValue}>{getStoryBeatLabel(activePage)}</Text>
              </View>
              <View style={styles.detailCard}>
                <Text style={styles.detailLabel}>Copy source</Text>
                <Text style={styles.detailValue}>{getCopySourceLabel(activePage)}</Text>
              </View>
              <View style={styles.detailCard}>
                <Text style={styles.detailLabel}>Photos on page</Text>
                <Text style={styles.detailValue}>{activePhotos.length}</Text>
              </View>
              <View style={styles.detailCard}>
                <Text style={styles.detailLabel}>Status</Text>
                <Text style={styles.detailValue}>
                  {activePage.approved ? "Ready" : "Needs approval"}
                </Text>
              </View>
            </View>

            <View style={styles.noteCard}>
              <Text style={styles.noteTitle}>Curation note</Text>
              <Text style={styles.noteBody}>{activePage.curationNote ?? activePage.layoutNote}</Text>
              {activePage.layoutNote && activePage.layoutNote !== activePage.curationNote ? (
                <Text style={styles.noteBodyMuted}>{activePage.layoutNote}</Text>
              ) : null}
            </View>

            <ActionButton
              dark={!activePage.approved}
              label={activePage.approved ? "Mark spread for another pass" : "Approve this spread"}
              onPress={() => onTogglePage(activePage.id)}
            />
          </View>
        ) : null}

        {inspectorTab === "copy" ? (
          <View style={styles.tabSection}>
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

            <View style={styles.inlineInfoCard}>
              <Text style={styles.inlineInfoTitle}>Copy review</Text>
              <Text style={styles.inlineInfoBody}>
                Save your wording as a draft first, then confirm it once the spread feels
                final.
              </Text>
            </View>

            <View style={styles.copyActionStack}>
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
                label={
                  activePage.copyStatus === "confirmed"
                    ? "Refresh confirmed copy"
                    : "Confirm copy"
                }
                onPress={() =>
                  onUpdatePageCopy(activePage.id, {
                    caption: activeDraft.caption,
                    confirmed: true,
                    title: activeDraft.title,
                  })
                }
              />
            </View>
          </View>
        ) : null}

        {inspectorTab === "photo" ? (
          <View style={styles.tabSection}>
            {selectedPhoto ? (
              <View style={styles.selectedPhotoCard}>
                {selectedPhoto.imageUri ? (
                  <Image source={{ uri: selectedPhoto.imageUri }} style={styles.selectedPhotoThumb} />
                ) : (
                  <View style={[styles.selectedPhotoThumb, styles.selectedPhotoThumbFallback]}>
                    <Text style={styles.photoFallbackText}>{selectedPhoto.orientation}</Text>
                  </View>
                )}
                <View style={styles.selectedPhotoCopy}>
                  <Text style={styles.cardEyebrow}>Selected photo</Text>
                  <Text style={styles.selectedPhotoTitle}>{selectedPhoto.title}</Text>
                  <Text style={styles.selectedPhotoBody}>
                    {selectedPhoto.locationLabel ?? "Location still missing"} ·{" "}
                    {selectedPhoto.orientation}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.inlineInfoCard}>
                <Text style={styles.inlineInfoTitle}>No photos on this spread</Text>
                <Text style={styles.inlineInfoBody}>
                  Move to another spread to review photos, or return to the spread tab and
                  keep shaping the pacing.
                </Text>
              </View>
            )}

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
                    photo.id === selectedPhoto?.id
                      ? [styles.photoCardSelected, { borderColor: `${accent}55` }]
                      : null,
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
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionStack: {
    gap: 14,
  },
  workspaceCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.card,
    padding: 16,
    gap: 14,
  },
  workspaceHeader: {
    gap: 12,
  },
  workspaceCopy: {
    gap: 4,
  },
  workspaceTitle: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "700",
    color: palette.ink,
  },
  workspaceBody: {
    fontSize: 13,
    lineHeight: 20,
    color: palette.muted,
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metricPill: {
    minWidth: 88,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.78)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 2,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.ink,
  },
  metricLabel: {
    fontSize: 11,
    lineHeight: 15,
    color: palette.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  surfaceCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.card,
    padding: 16,
    gap: 14,
  },
  cardEyebrow: {
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    fontWeight: "700",
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
    fontSize: 21,
    lineHeight: 25,
    fontWeight: "700",
    color: palette.ink,
  },
  pageMeta: {
    fontSize: 13,
    lineHeight: 19,
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
    textAlign: "center",
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
  inspectorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  inspectorHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  inspectorTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "700",
    color: palette.ink,
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.78)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusPillText: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "700",
    color: palette.muted,
  },
  tabGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tabButton: {
    flexGrow: 1,
    minWidth: 74,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.74)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tabButtonActive: {
    backgroundColor: palette.accentSoft,
    borderColor: "rgba(195,109,63,0.24)",
  },
  tabButtonText: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "700",
    color: palette.muted,
  },
  tabButtonTextActive: {
    color: palette.accent,
  },
  tabSection: {
    gap: 12,
  },
  inlineInfoCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.76)",
    padding: 14,
    gap: 4,
  },
  inlineInfoTitle: {
    fontSize: 13,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontWeight: "700",
    color: palette.muted,
  },
  inlineInfoBody: {
    fontSize: 13,
    lineHeight: 20,
    color: palette.ink,
  },
  themeRow: {
    gap: 10,
    paddingRight: 8,
  },
  themeChip: {
    width: 172,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.82)",
    padding: 12,
    gap: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  themeChipActive: {
    backgroundColor: "#fff6ef",
  },
  themeSwatch: {
    width: 16,
    height: 48,
    borderRadius: 999,
  },
  themeChipCopy: {
    flex: 1,
    gap: 2,
  },
  themeChipTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.ink,
  },
  themeChipBody: {
    fontSize: 12,
    lineHeight: 17,
    color: palette.muted,
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  detailCard: {
    flexGrow: 1,
    minWidth: 130,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.76)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 3,
  },
  detailLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "700",
    color: palette.muted,
  },
  detailValue: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.ink,
    textTransform: "capitalize",
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
    minHeight: 118,
  },
  copyActionStack: {
    gap: 10,
  },
  selectedPhotoCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.76)",
    padding: 12,
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
    width: 96,
    height: 96,
    borderRadius: 18,
    backgroundColor: "#e7ddd2",
  },
  selectedPhotoThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.accentSoft,
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
