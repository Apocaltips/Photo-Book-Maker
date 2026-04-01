import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Project } from "./core";
import {
  getProjectWebEditorUrl,
  getProjectWebPreviewUrl,
  getProjectWebUrl,
  getResolvedWebBaseUrl,
} from "./api";
import { StorybookPageCanvas } from "./storybook-page-canvas";

const palette = {
  accent: "#c36d3f",
  accentSoft: "#f2dfd1",
  card: "rgba(255,251,246,0.88)",
  forest: "#2e5c4d",
  ink: "#1f1814",
  line: "rgba(31, 24, 20, 0.12)",
  muted: "#6f625b",
};

type Props = {
  onExportProof: () => void;
  project?: Project;
};

function ActionButton({
  dark,
  disabled,
  label,
  onPress,
}: {
  dark?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionButton,
        dark ? styles.actionButtonDark : null,
        disabled ? styles.actionButtonDisabled : null,
      ]}
    >
      <Text style={[styles.actionButtonText, dark ? styles.actionButtonTextDark : null]}>
        {label}
      </Text>
    </Pressable>
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

function LinkCard({
  description,
  label,
  url,
}: {
  description: string;
  label: string;
  url: string | null;
}) {
  return (
    <View style={styles.linkCard}>
      <Text style={styles.linkCardTitle}>{label}</Text>
      <Text style={styles.linkCardBody}>{description}</Text>
      <Text selectable style={styles.linkCardUrl}>
        {url ?? "Web editor unavailable until EXPO_PUBLIC_API_BASE_URL points to the deployed site."}
      </Text>
    </View>
  );
}

async function openWebUrl(url: string | null, label: string) {
  if (!url) {
    Alert.alert(
      "Web editor not available",
      "Set the mobile app to your deployed web URL first so this phone knows where to open the editor.",
    );
    return;
  }

  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Couldn't open link", `Try opening this ${label} URL manually:\n\n${url}`);
  }
}

function getProjectAccent(project: Project) {
  return (
    project.bookThemes.find((theme) => theme.id === project.selectedThemeId)?.accent ??
    palette.accent
  );
}

export function MobileEditorTab({ onExportProof, project }: Props) {
  if (!project) {
    return null;
  }

  const editorUrl = getProjectWebEditorUrl(project.id);
  const previewUrl = getProjectWebPreviewUrl(project.id);
  const boardUrl = getProjectWebUrl(project.id);
  const webBaseUrl = getResolvedWebBaseUrl();
  const accent = getProjectAccent(project);
  const approvedPageCount = project.bookDraft.pages.filter((page) => page.approved).length;
  const confirmedCopyCount = project.bookDraft.pages.filter(
    (page) => page.copyStatus === "confirmed",
  ).length;
  const featuredPage =
    project.bookDraft.pages.find((page) => !page.approved) ?? project.bookDraft.pages[0];
  const featuredPhotos = featuredPage.photoIds
    .map((photoId) => project.photos.find((photo) => photo.id === photoId))
    .filter((photo): photo is Project["photos"][number] => Boolean(photo));

  return (
    <View style={styles.sectionStack}>
      <View style={styles.surfaceCard}>
        <Text style={styles.cardEyebrow}>Editing handoff</Text>
        <Text style={styles.cardTitle}>Collect on phone, design on web</Text>
        <Text style={styles.cardBody}>
          The mobile app is now the fast collection workflow: upload photos, add notes,
          invite collaborators, and keep the trip moving. Use the web editor for book
          design, spread changes, captions, and final proof review.
        </Text>

        <View style={styles.metricRow}>
          <MetricPill label="Photos" value={project.photos.length} />
          <MetricPill label="Spreads" value={project.bookDraft.pages.length} />
          <MetricPill label="Approved" value={approvedPageCount} />
          <MetricPill label="Copy locked" value={confirmedCopyCount} />
        </View>

        <View style={styles.actionStack}>
          <ActionButton
            dark
            disabled={!editorUrl}
            label="Open web editor"
            onPress={() => openWebUrl(editorUrl, "editor")}
          />
          <ActionButton
            disabled={!previewUrl}
            label="Open web preview"
            onPress={() => openWebUrl(previewUrl, "preview")}
          />
          <ActionButton
            disabled={!boardUrl}
            label="Open curated draft board"
            onPress={() => openWebUrl(boardUrl, "board")}
          />
          <ActionButton label="Export proof PDF from phone" onPress={onExportProof} />
        </View>
      </View>

      <View style={styles.surfaceCard}>
        <Text style={styles.cardEyebrow}>Current spread preview</Text>
        <Text style={styles.previewTitle}>{featuredPage.title}</Text>
        <Text style={styles.previewBody}>
          Quick phone preview only. Real layout editing happens on the web editor so you
          and your girlfriend are working from one polished editing surface.
        </Text>

        <StorybookPageCanvas
          accent={accent}
          page={featuredPage}
          photos={featuredPhotos}
          project={project}
        />
      </View>

      <View style={styles.surfaceCard}>
        <Text style={styles.cardEyebrow}>Open on your laptop</Text>
        <Text style={styles.cardBody}>
          Sign into the web app with the same account you use here. Start from the editor
          link if you want to jump straight into spread editing.
        </Text>

        <ScrollView
          contentContainerStyle={styles.linkStack}
          showsVerticalScrollIndicator={false}
        >
          <LinkCard
            description="Best place to change spreads, captions, themes, and sequence."
            label="Editor URL"
            url={editorUrl}
          />
          <LinkCard
            description="Use this for the proof board and project overview."
            label="Project board URL"
            url={boardUrl}
          />
          <LinkCard
            description="Use this for read-only printable preview checks."
            label="Preview URL"
            url={previewUrl}
          />
          <LinkCard
            description="The mobile app is currently pointed at this deployed site."
            label="Web base URL"
            url={webBaseUrl}
          />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionStack: {
    gap: 14,
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
  cardTitle: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "700",
    color: palette.ink,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 21,
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
    fontSize: 16,
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
  actionStack: {
    gap: 10,
  },
  actionButton: {
    minHeight: 46,
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
  actionButtonDisabled: {
    opacity: 0.52,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.ink,
  },
  actionButtonTextDark: {
    color: "#fffaf5",
  },
  previewTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "700",
    color: palette.ink,
  },
  previewBody: {
    fontSize: 13,
    lineHeight: 20,
    color: palette.muted,
  },
  linkStack: {
    gap: 10,
  },
  linkCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.78)",
    padding: 14,
    gap: 6,
  },
  linkCardTitle: {
    fontSize: 13,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontWeight: "700",
    color: palette.muted,
  },
  linkCardBody: {
    fontSize: 13,
    lineHeight: 19,
    color: palette.ink,
  },
  linkCardUrl: {
    fontSize: 12,
    lineHeight: 18,
    color: palette.accent,
  },
});
