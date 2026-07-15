import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  BOOK_TEMPLATE_PACKS,
  buildBookGenerationQuestionnaire,
  ensureDraftEditorState,
  getBookMakingGuide,
  getBookTemplatePack,
  type BookGenerationQuestionnaireAnswers,
  type BookMakingGuide,
  type BookPage,
  type BookTemplatePack,
  type Project,
  type PublishedBookDraft,
} from "@photo-book-maker/core";
import {
  getProjectWebEditorUrl,
  getProjectWebProofUrl,
  getProjectWebPreviewUrl,
} from "./api";
import { StorybookPageCanvas } from "./storybook-page-canvas";

const palette = {
  accent: "#c36d3f",
  accentSoft: "#f2dfd1",
  card: "rgba(255,251,246,0.88)",
  forest: "#2e5c4d",
  forestSoft: "#d9ebe3",
  ink: "#1f1814",
  line: "rgba(31, 24, 20, 0.12)",
  muted: "#6f625b",
  paper: "#fffaf5",
};

type Props = {
  isAiGenerating?: boolean;
  onGenerateAiBook: (questionnaire?: Partial<BookGenerationQuestionnaireAnswers>) => void;
  onExportProof: () => void;
  onLoadPublishedDraft: (snapshot: PublishedBookDraft) => void;
  onPublishDraft: (name: string) => void;
  onSelectTemplatePack: (templatePackId: string) => void;
  onSelectTheme: (themeId: string) => void;
  onTogglePage: (pageId: string) => void;
  onUpdatePageCopy: (
    pageId: string,
    input: { caption: string; confirmed?: boolean; title: string },
  ) => void;
  project?: Project;
};

const captionDepthOptions: Array<{
  label: string;
  value: BookGenerationQuestionnaireAnswers["captionDepth"];
}> = [
  { label: "Short", value: "short" },
  { label: "Balanced", value: "balanced" },
  { label: "Story", value: "story" },
];

const densityOptions: Array<{
  label: string;
  value: BookGenerationQuestionnaireAnswers["density"];
}> = [
  { label: "Airy", value: "airy" },
  { label: "Balanced", value: "balanced" },
  { label: "Full", value: "full" },
];

const toneOptions: Array<{
  label: string;
  value: BookGenerationQuestionnaireAnswers["tone"];
}> = [
  { label: "Warm", value: "warm" },
  { label: "Reflective", value: "reflective" },
  { label: "Playful", value: "playful" },
  { label: "Simple", value: "factual" },
];

const bookSizeOptions: Array<{
  label: string;
  value: BookGenerationQuestionnaireAnswers["bookSize"];
}> = [
  { label: "Large square", value: "12x12-square" },
  { label: "Classic square", value: "10x10-square" },
  { label: "Small square", value: "8x8-square" },
  { label: "Landscape", value: "11x8.5-landscape" },
];

function getProjectAccent(project: Project) {
  return (
    project.bookThemes.find((theme) => theme.id === project.selectedThemeId)?.accent ??
    palette.accent
  );
}

function getPagePhotos(project: Project, page: BookPage) {
  return page.photoIds
    .map((photoId) => project.photos.find((photo) => photo.id === photoId))
    .filter((photo): photo is Project["photos"][number] => Boolean(photo));
}

function getTemplatePack(project: Project) {
  const editorState = ensureDraftEditorState(project);
  return getBookTemplatePack(editorState.templatePackId) ?? BOOK_TEMPLATE_PACKS[0];
}

function ActionButton({
  disabled,
  label,
  onPress,
  tone = "light",
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  tone?: "dark" | "light" | "soft";
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.actionButton,
        tone === "dark" ? styles.actionButtonDark : null,
        tone === "soft" ? styles.actionButtonSoft : null,
        disabled ? styles.actionButtonDisabled : null,
      ]}
    >
      <Text
        style={[
          styles.actionButtonText,
          tone === "dark" ? styles.actionButtonTextDark : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function DesignerTextField({
  label,
  multiline,
  onChangeText,
  placeholder,
  value,
}: {
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <View style={styles.questionField}>
      <Text style={styles.questionLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9a8c80"
        multiline={multiline}
        style={[styles.input, multiline ? styles.textarea : null]}
      />
    </View>
  );
}

function DesignerChoiceRow<Value extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: Value) => void;
  options: Array<{ label: string; value: Value }>;
  value: Value;
}) {
  return (
    <View style={styles.questionField}>
      <Text style={styles.questionLabel}>{label}</Text>
      <View style={styles.choiceRow}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.choiceChip,
              option.value === value ? styles.choiceChipActive : null,
            ]}
          >
            <Text
              style={[
                styles.choiceChipText,
                option.value === value ? styles.choiceChipTextActive : null,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
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

function TemplatePackChip({
  active,
  pack,
  onPress,
}: {
  active: boolean;
  pack: BookTemplatePack;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.templateChip,
        active ? styles.templateChipActive : null,
      ]}
    >
      <View
        style={[
          styles.templateChipSwatch,
          { backgroundColor: pack.previewAccent },
        ]}
      />
      <Text style={styles.templateChipTitle}>{pack.name}</Text>
      <Text style={styles.templateChipMeta}>
        {pack.category} / {pack.spreadTemplateIds.length} spreads
      </Text>
    </Pressable>
  );
}

function ThemeChip({
  active,
  theme,
  onPress,
}: {
  active: boolean;
  theme: Project["bookThemes"][number];
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.themeChip, active ? styles.themeChipActive : null]}
    >
      <View style={[styles.themeSwatch, { backgroundColor: theme.accent }]} />
      <Text style={styles.themeTitle}>{theme.name}</Text>
      <Text style={styles.themeBody}>{theme.mood}</Text>
    </Pressable>
  );
}

function PagePill({
  active,
  index,
  page,
  onPress,
}: {
  active: boolean;
  index: number;
  page: BookPage;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pagePill, active ? styles.pagePillActive : null]}
    >
      <Text style={styles.pagePillIndex}>{index + 1}</Text>
      <Text style={styles.pagePillTitle} numberOfLines={2}>
        {page.title}
      </Text>
      <Text style={styles.pagePillMeta}>
        {page.approved ? "Approved" : "Needs review"}
      </Text>
    </Pressable>
  );
}

async function openWebUrl(url: string | null, label: string) {
  if (!url) {
    Alert.alert(
      "Web link unavailable",
      "Point EXPO_PUBLIC_API_BASE_URL at the deployed web app to open this link.",
    );
    return;
  }

  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Could not open link", `Try opening this ${label} URL manually:\n\n${url}`);
  }
}

function formatGenerationStatus(status?: string) {
  switch (status) {
    case "saved":
      return "Draft ready";
    case "running":
      return "Making book";
    case "failed":
      return "Needs retry";
    default:
      return "None";
  }
}

function formatGenerationProgress(progress: string[]) {
  if (!progress.length) {
    return "Ready";
  }

  const latest = progress.at(-1)?.toLowerCase() ?? "";
  if (latest.includes("saved")) {
    return "Photo review, layout, and captions finished.";
  }
  if (latest.includes("vision") || latest.includes("photo")) {
    return "Reviewing the uploaded photos.";
  }
  if (latest.includes("plan") || latest.includes("draft")) {
    return "Building the book draft.";
  }

  return "Working on the book.";
}

export function MobileEditorTab({
  isAiGenerating = false,
  onGenerateAiBook,
  onExportProof,
  onLoadPublishedDraft,
  onPublishDraft,
  onSelectTemplatePack,
  onSelectTheme,
  onTogglePage,
  onUpdatePageCopy,
  project,
}: Props) {
  const [selectedPageId, setSelectedPageId] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [captionDraft, setCaptionDraft] = useState("");
  const [publishName, setPublishName] = useState("");
  const [aiAnswers, setAiAnswers] = useState<Partial<BookGenerationQuestionnaireAnswers>>({});

  const selectedPage =
    project?.bookDraft.pages.find((page) => page.id === selectedPageId) ??
    project?.bookDraft.pages[0];
  const selectedPageIndex = project?.bookDraft.pages.findIndex(
    (page) => page.id === selectedPage?.id,
  ) ?? 0;

  useEffect(() => {
    if (!project) {
      return;
    }

    const nextPage =
      project.bookDraft.pages.find((page) => page.id === selectedPageId) ??
      project.bookDraft.pages[0];

    setSelectedPageId(nextPage?.id ?? "");
  }, [project, selectedPageId]);

  useEffect(() => {
    setTitleDraft(selectedPage?.title ?? "");
    setCaptionDraft(selectedPage?.caption ?? "");
  }, [selectedPage?.caption, selectedPage?.id, selectedPage?.title]);

  useEffect(() => {
    if (project) {
      setPublishName(`${project.title} - iOS edit`);
    }
  }, [project?.id, project?.title]);

  const selectedPhotos = useMemo(
    () => (project && selectedPage ? getPagePhotos(project, selectedPage) : []),
    [project, selectedPage],
  );
  const defaultAiAnswers = useMemo(
    () => (project ? buildBookGenerationQuestionnaire(project).answers : null),
    [project],
  );
  const designerAnswers = useMemo(
    () => (defaultAiAnswers ? { ...defaultAiAnswers, ...aiAnswers } : null),
    [aiAnswers, defaultAiAnswers],
  );

  useEffect(() => {
    setAiAnswers({});
  }, [project?.id]);

  if (!project) {
    return null;
  }

  const editorState = ensureDraftEditorState(project);
  const bookGuide = getBookMakingGuide(project);
  const selectedTemplatePack = getTemplatePack(project);
  const accent = getProjectAccent(project);
  const approvedPageCount = project.bookDraft.pages.filter((page) => page.approved).length;
  const confirmedCopyCount = project.bookDraft.pages.filter(
    (page) => page.copyStatus === "confirmed",
  ).length;
  const previewUrl = getProjectWebPreviewUrl(project.id);
  const editorUrl = getProjectWebEditorUrl(project.id);
  const proofUrl = getProjectWebProofUrl(project.id);
  const latestGenerationRun = project.generationRuns?.[0];
  const generationNotice = latestGenerationRun?.validationWarnings.length
    ? latestGenerationRun.status === "failed"
      ? "The book could not be made. Check the local AI service and try again."
      : "A few design details were cleaned up automatically before saving."
    : null;
  const unresolvedBlockers = project.resolutionTasks.filter(
    (task) => task.status !== "resolved",
  ).length;
  const approvedPhotoCount = project.photos.filter((photo) => photo.approved).length;
  const canRunAiDesigner = approvedPhotoCount > 0 && unresolvedBlockers === 0;
  const hasUnsavedCopy =
    selectedPage &&
    (titleDraft.trim() !== selectedPage.title || captionDraft.trim() !== selectedPage.caption);

  function saveCopy(confirmed?: boolean) {
    if (!selectedPage) {
      return;
    }

    onUpdatePageCopy(selectedPage.id, {
      caption: captionDraft,
      confirmed,
      title: titleDraft,
    });
  }

  function updateAiAnswer<Key extends keyof BookGenerationQuestionnaireAnswers>(
    key: Key,
    value: BookGenerationQuestionnaireAnswers[Key],
  ) {
    setAiAnswers((current) => ({
      ...current,
      [key]: value,
    }));
  }

  return (
    <View style={styles.sectionStack}>
      <View style={styles.surfaceCard}>
        <Text style={styles.cardEyebrow}>Book editor</Text>
        <Text style={styles.cardTitle}>Edit this book on your phone</Text>
        <Text style={styles.cardBody}>
          Review one spread at a time, adjust the words or template, save a draft,
          and export the proof from the same book.
        </Text>

        <View style={styles.metricRow}>
          <MetricPill label="Photos" value={project.photos.length} />
          <MetricPill label="Spreads" value={project.bookDraft.pages.length} />
          <MetricPill label="Approved" value={approvedPageCount} />
          <MetricPill label="Copy locked" value={confirmedCopyCount} />
        </View>
      </View>

      <MobileWorkflowGuide guide={bookGuide} isAiGenerating={isAiGenerating ?? false} />

      <View style={styles.surfaceCard}>
        <Text style={styles.cardEyebrow}>AI Designer</Text>
        <Text style={styles.cardTitle}>Make my photo book</Text>
        <Text style={styles.cardBody}>
          Defaults are fine. The local AI picks templates, writes captions, and saves
          a draft you can edit.
        </Text>

        <View style={styles.metricRow}>
          <MetricPill label="Photos ready" value={approvedPhotoCount} />
          <MetricPill label="Fix before print" value={unresolvedBlockers} />
          <MetricPill
            label="Last run"
            value={formatGenerationStatus(latestGenerationRun?.status)}
          />
        </View>

        {designerAnswers ? (
          <View style={styles.questionStack}>
            <DesignerTextField
              label="What is this book for?"
              value={designerAnswers.tripPurpose}
              onChangeText={(value) => updateAiAnswer("tripPurpose", value)}
              multiline
            />
            <DesignerTextField
              label="Who is it for?"
              value={designerAnswers.audience}
              onChangeText={(value) => updateAiAnswer("audience", value)}
              placeholder="Us, our kids someday, grandparents, the trip group..."
            />
            <DesignerTextField
              label="Moments that must appear"
              value={designerAnswers.mustIncludeMoments}
              onChangeText={(value) => updateAiAnswer("mustIncludeMoments", value)}
              placeholder="Pool, beach, dinner, favorite couple photo..."
              multiline
            />
            <DesignerTextField
              label="Cover photo preference"
              value={designerAnswers.coverPreference}
              onChangeText={(value) => updateAiAnswer("coverPreference", value)}
            />
            <DesignerTextField
              label="Names and privacy"
              value={designerAnswers.namesPrivacy}
              onChangeText={(value) => updateAiAnswer("namesPrivacy", value)}
            />
            <DesignerTextField
              label="Maps, food, tickets, and little details"
              value={designerAnswers.mapMemorabiliaPreference}
              onChangeText={(value) => updateAiAnswer("mapMemorabiliaPreference", value)}
              multiline
            />
            <DesignerChoiceRow
              label="Caption style"
              options={captionDepthOptions}
              value={designerAnswers.captionDepth}
              onChange={(value) => updateAiAnswer("captionDepth", value)}
            />
            <DesignerChoiceRow
              label="Writing tone"
              options={toneOptions}
              value={designerAnswers.tone}
              onChange={(value) => updateAiAnswer("tone", value)}
            />
            <DesignerChoiceRow
              label="Page fullness"
              options={densityOptions}
              value={designerAnswers.density}
              onChange={(value) => updateAiAnswer("density", value)}
            />
            <DesignerChoiceRow
              label="Book size"
              options={bookSizeOptions}
              value={designerAnswers.bookSize}
              onChange={(value) => updateAiAnswer("bookSize", value)}
            />
          </View>
        ) : null}

        {latestGenerationRun ? (
          <View style={styles.aiRunPanel}>
            <Text style={styles.aiRunTitle}>
              {latestGenerationRun.status === "saved" ? "Draft ready to review" : "Book build status"}
            </Text>
            <Text style={styles.aiRunBody}>
              {formatGenerationProgress(latestGenerationRun.progress)}
            </Text>
            {generationNotice ? (
              <Text style={styles.aiWarning}>{generationNotice}</Text>
            ) : null}
          </View>
        ) : null}

        <ActionButton
          disabled={isAiGenerating || !canRunAiDesigner}
          label={isAiGenerating ? "Making the book..." : "Make my book"}
          onPress={() => onGenerateAiBook(designerAnswers ?? undefined)}
          tone="dark"
        />
        {!canRunAiDesigner ? (
          <Text style={styles.helperText}>
            Add photos and clear open fixes before making the book.
          </Text>
        ) : null}
      </View>

      <View style={styles.surfaceCard}>
        <Text style={styles.cardEyebrow}>Template catalog</Text>
        <Text style={styles.cardBody}>
          {BOOK_TEMPLATE_PACKS.length} book packs are available. The selected pack
          saves with the draft and reopens the same on web.
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.horizontalChipRow}>
            {BOOK_TEMPLATE_PACKS.map((pack) => (
              <TemplatePackChip
                key={pack.id}
                active={pack.id === selectedTemplatePack?.id}
                pack={pack}
                onPress={() => onSelectTemplatePack(pack.id)}
              />
            ))}
          </View>
        </ScrollView>
        <Text style={styles.helperText}>
          Active: {selectedTemplatePack?.name ?? "Default pack"} / {editorState.formatId} /{" "}
          {editorState.styleMode.replaceAll("_", " ")}
        </Text>
      </View>

      <View style={styles.surfaceCard}>
        <Text style={styles.cardEyebrow}>Theme</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.horizontalChipRow}>
            {project.bookThemes.map((theme) => (
              <ThemeChip
                key={theme.id}
                active={theme.id === project.selectedThemeId}
                theme={theme}
                onPress={() => onSelectTheme(theme.id)}
              />
            ))}
          </View>
        </ScrollView>
      </View>

      <View style={styles.surfaceCard}>
        <Text style={styles.cardEyebrow}>Spread navigator</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.horizontalChipRow}>
            {project.bookDraft.pages.map((page, index) => (
              <PagePill
                key={page.id}
                active={page.id === selectedPage?.id}
                index={index}
                page={page}
                onPress={() => setSelectedPageId(page.id)}
              />
            ))}
          </View>
        </ScrollView>
      </View>

      {selectedPage ? (
        <View style={styles.surfaceCard}>
          <Text style={styles.cardEyebrow}>
            Spread {Math.max(0, selectedPageIndex) + 1} / copy and approval
          </Text>
          <Text style={styles.cardBody}>
            {selectedPage.templateId ?? "No template id"} /{" "}
            {selectedPage.layoutVariation
              ? `variation ${selectedPage.layoutVariation}`
              : selectedPage.style}
          </Text>

          <TextInput
            value={titleDraft}
            onChangeText={setTitleDraft}
            placeholder="Spread title"
            placeholderTextColor={palette.muted}
            style={styles.input}
          />
          <TextInput
            value={captionDraft}
            onChangeText={setCaptionDraft}
            multiline
            placeholder="Spread caption"
            placeholderTextColor={palette.muted}
            style={[styles.input, styles.textarea]}
          />

          <View style={styles.actionRow}>
            <ActionButton
              disabled={!hasUnsavedCopy}
              label="Save copy"
              onPress={() => saveCopy(false)}
            />
            <ActionButton
              label={selectedPage.copyStatus === "confirmed" ? "Copy locked" : "Lock copy"}
              onPress={() => saveCopy(true)}
              tone="soft"
            />
          </View>

          <ActionButton
            label={selectedPage.approved ? "Mark as needs review" : "Approve spread"}
            onPress={() => onTogglePage(selectedPage.id)}
            tone={selectedPage.approved ? "soft" : "dark"}
          />
        </View>
      ) : null}

      {selectedPage ? (
        <View style={styles.surfaceCard}>
          <Text style={styles.cardEyebrow}>Print-safe preview</Text>
          <StorybookPageCanvas
            accent={accent}
            page={selectedPage}
            photos={selectedPhotos}
            project={project}
          />
          <View style={styles.previewMetaRow}>
            {selectedPhotos.map((photo) => (
              <Text key={photo.id} style={styles.previewMeta}>
                {photo.mustInclude ? "Must include / " : ""}
                {photo.title}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.surfaceCard}>
        <Text style={styles.cardEyebrow}>Draft versions</Text>
        <TextInput
          value={publishName}
          onChangeText={setPublishName}
          placeholder="Draft name"
          placeholderTextColor={palette.muted}
          style={styles.input}
        />
        <ActionButton
          label="Publish named draft"
          onPress={() => onPublishDraft(publishName.trim() || `${project.title} - iOS edit`)}
          tone="dark"
        />
        {project.publishedDrafts?.length ? (
          <View style={styles.draftStack}>
            {project.publishedDrafts.slice(0, 5).map((snapshot) => (
              <Pressable
                key={snapshot.id}
                onPress={() => onLoadPublishedDraft(snapshot)}
                style={styles.draftCard}
              >
                <Text style={styles.draftTitle}>{snapshot.name}</Text>
                <Text style={styles.draftBody}>
                  {snapshot.bookDraft.pages.length} spreads /{" "}
                  {new Date(snapshot.savedAt).toLocaleDateString()}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No published drafts yet.</Text>
        )}
      </View>

      <View style={styles.surfaceCard}>
        <Text style={styles.cardEyebrow}>Final step</Text>
        <Text style={styles.cardBody}>
          Save the book as a PDF from this phone, or open the web PDF page when you
          want browser print controls.
        </Text>
        <View style={styles.actionStack}>
          <ActionButton label="Save PDF from phone" onPress={onExportProof} tone="dark" />
          <ActionButton
            label="Open web PDF page"
            onPress={() => openWebUrl(proofUrl, "proof")}
          />
          <ActionButton
            label="Open web review"
            onPress={() => openWebUrl(previewUrl, "preview")}
          />
          <ActionButton
            label="Open web editor"
            onPress={() => openWebUrl(editorUrl, "editor")}
          />
        </View>
      </View>
    </View>
  );
}

function MobileWorkflowGuide({
  guide,
  isAiGenerating,
}: {
  guide: BookMakingGuide;
  isAiGenerating: boolean;
}) {
  return (
    <View style={styles.surfaceCard}>
      <Text style={styles.cardEyebrow}>Easy path</Text>
      <Text style={styles.cardTitle}>Next: {guide.nextActionLabel}</Text>
      <Text style={styles.cardBody}>{guide.nextStepDetail}</Text>

      <View style={styles.workflowStepStack}>
        {guide.steps.map((step, index) => (
          <View key={step.id} style={styles.workflowStepCard}>
            <View style={styles.workflowStepNumber}>
              <Text style={styles.workflowStepNumberText}>{index + 1}</Text>
            </View>
            <View style={styles.workflowStepBody}>
              <Text style={styles.workflowStepTitle}>{step.label.replace(/^\d+\.\s*/, "")}</Text>
              <Text style={styles.workflowStepDetail}>{step.detail}</Text>
            </View>
            <Text
              style={[
                styles.workflowStepStatus,
                step.status === "blocked" ? styles.workflowStepStatusBlocked : null,
                step.status === "done" ? styles.workflowStepStatusDone : null,
              ]}
            >
              {step.id === "design" && isAiGenerating
                ? "Working"
                : getMobileStepStatusLabel(step.status)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function getMobileStepStatusLabel(status: BookMakingGuide["steps"][number]["status"]) {
  switch (status) {
    case "blocked":
      return "Fix";
    case "current":
      return "Now";
    case "done":
      return "Done";
    case "waiting":
      return "Next";
  }
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
  helperText: {
    fontSize: 13,
    lineHeight: 20,
    color: palette.forest,
    fontWeight: "600",
    textTransform: "capitalize",
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
  questionStack: {
    gap: 12,
  },
  questionField: {
    gap: 7,
  },
  questionLabel: {
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    fontWeight: "700",
    color: palette.muted,
  },
  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  choiceChip: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.78)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  choiceChipActive: {
    borderColor: "rgba(46,92,77,0.36)",
    backgroundColor: palette.forestSoft,
  },
  choiceChipText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  choiceChipTextActive: {
    color: palette.forest,
  },
  workflowStepStack: {
    gap: 10,
  },
  workflowStepCard: {
    minHeight: 76,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.78)",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  workflowStepNumber: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.ink,
  },
  workflowStepNumberText: {
    color: "#fffaf5",
    fontSize: 14,
    fontWeight: "700",
  },
  workflowStepBody: {
    flex: 1,
    minWidth: 0,
  },
  workflowStepTitle: {
    fontSize: 15,
    lineHeight: 18,
    color: palette.ink,
    fontWeight: "700",
  },
  workflowStepDetail: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: palette.muted,
  },
  workflowStepStatus: {
    minWidth: 48,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: palette.accentSoft,
    paddingHorizontal: 9,
    paddingVertical: 5,
    textAlign: "center",
    fontSize: 11,
    lineHeight: 14,
    color: palette.accent,
    fontWeight: "700",
  },
  workflowStepStatusBlocked: {
    backgroundColor: "#f8ded2",
    color: "#983d16",
  },
  workflowStepStatusDone: {
    backgroundColor: palette.forestSoft,
    color: palette.forest,
  },
  horizontalChipRow: {
    flexDirection: "row",
    gap: 10,
    paddingRight: 8,
  },
  templateChip: {
    width: 184,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.78)",
    padding: 12,
    gap: 6,
  },
  templateChipActive: {
    borderColor: "rgba(195,109,63,0.42)",
    backgroundColor: "#fff6ef",
  },
  templateChipSwatch: {
    width: 36,
    height: 8,
    borderRadius: 999,
  },
  templateChipTitle: {
    fontSize: 15,
    lineHeight: 18,
    color: palette.ink,
    fontWeight: "700",
  },
  templateChipMeta: {
    fontSize: 11,
    lineHeight: 16,
    color: palette.muted,
    textTransform: "capitalize",
  },
  themeChip: {
    width: 154,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.78)",
    padding: 12,
    gap: 6,
  },
  themeChipActive: {
    borderColor: "rgba(46,92,77,0.36)",
    backgroundColor: "#f7fff9",
  },
  themeSwatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  themeTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.ink,
  },
  themeBody: {
    fontSize: 11,
    lineHeight: 16,
    color: palette.muted,
  },
  pagePill: {
    width: 142,
    minHeight: 106,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.78)",
    padding: 12,
    gap: 5,
  },
  pagePillActive: {
    borderColor: "rgba(195,109,63,0.42)",
    backgroundColor: palette.accentSoft,
  },
  pagePillIndex: {
    fontSize: 12,
    color: palette.accent,
    fontWeight: "700",
  },
  pagePillTitle: {
    fontSize: 14,
    lineHeight: 17,
    color: palette.ink,
    fontWeight: "700",
  },
  pagePillMeta: {
    fontSize: 11,
    lineHeight: 16,
    color: palette.muted,
  },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paper,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: palette.ink,
    fontSize: 15,
  },
  textarea: {
    minHeight: 118,
    textAlignVertical: "top",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  actionStack: {
    gap: 10,
  },
  aiRunPanel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(46,92,77,0.16)",
    backgroundColor: "rgba(255,255,255,0.74)",
    padding: 12,
    gap: 5,
  },
  aiRunTitle: {
    fontSize: 13,
    lineHeight: 18,
    color: palette.ink,
    fontWeight: "700",
  },
  aiRunBody: {
    fontSize: 12,
    lineHeight: 18,
    color: palette.muted,
  },
  aiWarning: {
    fontSize: 12,
    lineHeight: 18,
    color: palette.accent,
    fontWeight: "600",
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
  actionButtonSoft: {
    backgroundColor: palette.forestSoft,
    borderColor: "rgba(46,92,77,0.24)",
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
  previewMetaRow: {
    gap: 5,
  },
  previewMeta: {
    fontSize: 12,
    lineHeight: 18,
    color: palette.muted,
    fontWeight: "600",
  },
  draftStack: {
    gap: 10,
  },
  draftCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.78)",
    padding: 14,
    gap: 4,
  },
  draftTitle: {
    fontSize: 15,
    lineHeight: 19,
    color: palette.ink,
    fontWeight: "700",
  },
  draftBody: {
    fontSize: 12,
    lineHeight: 18,
    color: palette.muted,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
    color: palette.muted,
  },
});
