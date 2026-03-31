import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { startTransition, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  addNoteRemote,
  addPhotosRemote,
  advancePrintOrderRemote,
  createPhotoUploadTicketRemote,
  createProjectRemote,
  fetchProjectsRemote,
  finalizeProjectRemote,
  getResolvedApiBaseUrl,
  hasRemoteApi,
  inviteCollaboratorRemote,
  resolveTaskRemote,
  setThemeRemote,
  toggleMustIncludeRemote,
  togglePageApprovalRemote,
  updatePageCopyRemote,
  uploadFileToRemoteStorage,
} from "./src/api";
import {
  addCollaborator,
  addNoteToProject,
  addPhotosToProject,
  buildAnniversaryYearEndDate,
  buildCalendarYearRange,
  createMockProject,
  createSeedProjects,
  cyclePrintOrder,
  finalizeProject,
  formatProjectRange,
  getProjectSummary,
  getYearbookCycleLabel,
  listOpenTasks,
  resolveProjectTask,
  toggleMustIncludePhoto,
  togglePageApproval,
  updateBookPageCopy,
  type Project,
  type ProjectType,
  type YearbookCycle,
} from "./src/core";
import { buildProofHtml } from "./src/proof";
import { MobileEditorTab } from "./src/editor-tab";
import { localStorage } from "./src/local-storage";
import {
  authClient,
  getAuthIdentityFromUser,
  getCurrentAuthIdentity,
  isSupabaseAuthConfigured,
  type AuthIdentity,
} from "./src/supabase";

type AppTab = "projects" | "tasks" | "editor" | "print";
type SyncMode = "checking" | "shared" | "local";
type OpenTask = ReturnType<typeof listOpenTasks>[number];

const STORAGE_KEY = "photo-book-maker-state-v2";
const tabOrder: AppTab[] = ["projects", "tasks", "editor", "print"];
const tabLabels: Record<AppTab, string> = {
  projects: "Books",
  tasks: "Fixes",
  editor: "Layout",
  print: "Print",
};
const palette = {
  bg: "#f4ede5",
  ink: "#1f1814",
  muted: "#6f625b",
  line: "rgba(31, 24, 20, 0.12)",
  card: "rgba(255, 251, 246, 0.88)",
  accent: "#c36d3f",
  accentSoft: "#f2dfd1",
  forest: "#2e5c4d",
  forestSoft: "#d9ebe3",
  blueSoft: "#dbe7f2",
  plumSoft: "#ebe4f1",
};

function parseExifDateTime(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.match(
    /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/,
  );
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
}

function parseExifFraction(value: string) {
  const [numerator, denominator] = value.split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return NaN;
  }
  return numerator / denominator;
}

function parseExifCoordinate(value: unknown, ref: unknown) {
  const normalizeSign = (coordinate: number) => {
    if (ref === "S" || ref === "W") {
      return coordinate * -1;
    }
    return coordinate;
  };

  if (typeof value === "number") {
    return normalizeSign(value);
  }

  if (Array.isArray(value) && value.length >= 3) {
    const [degrees, minutes, seconds] = value.map(Number);
    if ([degrees, minutes, seconds].every((entry) => Number.isFinite(entry))) {
      return normalizeSign(degrees + minutes / 60 + seconds / 3600);
    }
  }

  if (typeof value === "string") {
    const parts = value.split(",").map((entry) => entry.trim());
    if (parts.length >= 3) {
      const [degrees, minutes, seconds] = parts.map(parseExifFraction);
      if ([degrees, minutes, seconds].every((entry) => Number.isFinite(entry))) {
        return normalizeSign(degrees + minutes / 60 + seconds / 3600);
      }
    }

    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return normalizeSign(numeric);
    }
  }

  return null;
}

function getProjectCoverPhoto(project: Project) {
  return (
    project.photos.find((photo) => photo.mustInclude && photo.imageUri) ??
    project.photos.find((photo) => photo.imageUri) ??
    project.photos.find((photo) => photo.mustInclude) ??
    project.photos[0]
  );
}

function getProjectAccent(project: Project) {
  return (
    project.bookThemes.find((theme) => theme.id === project.selectedThemeId)?.accent ??
    palette.accent
  );
}

function getProjectProgress(project: Project) {
  switch (project.status) {
    case "printed":
      return 1;
    case "ready_to_print":
      return 0.9;
    case "reviewing":
      return 0.72;
    case "needs_resolution":
      return 0.48;
    case "collecting":
    default:
      return 0.26;
  }
}

function getProjectStageLabel(project: Project) {
  switch (project.status) {
    case "printed":
      return "Printed and archived";
    case "ready_to_print":
      return "Ready for print";
    case "reviewing":
      return "In proof review";
    case "needs_resolution":
      return "Needs a few fixes";
    case "collecting":
    default:
      return "Still collecting moments";
  }
}

function getPhotoIdForTask(taskId: string) {
  if (!taskId.startsWith("task-")) {
    return null;
  }

  return taskId.slice(5);
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>(() => createSeedProjects());
  const [selectedProjectId, setSelectedProjectId] = useState("yellowstone-weekend");
  const [activeTab, setActiveTab] = useState<AppTab>("projects");
  const [hasHydrated, setHasHydrated] = useState(false);
  const [authReady, setAuthReady] = useState(!isSupabaseAuthConfigured);
  const [authIdentity, setAuthIdentity] = useState<AuthIdentity | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMode, setAuthMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNameInput, setAuthNameInput] = useState("Vince");
  const [authEmailInput, setAuthEmailInput] = useState("");
  const [authPasswordInput, setAuthPasswordInput] = useState("");
  const [syncMode, setSyncMode] = useState<SyncMode>("checking");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [draftType, setDraftType] = useState<ProjectType>("trip");
  const [draftYearbookCycle, setDraftYearbookCycle] =
    useState<YearbookCycle>("calendar_year");
  const [draftCalendarYear, setDraftCalendarYear] = useState("2026");
  const [draftAnniversaryDate, setDraftAnniversaryDate] = useState("2025-03-30");
  const [testerName, setTesterName] = useState("Vince");
  const [testerEmail, setTesterEmail] = useState("vince@example.com");
  const [draftTitle, setDraftTitle] = useState("Coastal Weekend");
  const [draftSubtitle, setDraftSubtitle] = useState(
    "Misty mornings, ferry coffee, and a stack of portraits worth printing.",
  );
  const [draftStartDate, setDraftStartDate] = useState("2026-07-11");
  const [draftEndDate, setDraftEndDate] = useState("2026-07-14");
  const [inviteName, setInviteName] = useState("Ava");
  const [inviteEmail, setInviteEmail] = useState("ava@example.com");
  const [noteTitle, setNoteTitle] = useState("First impression");
  const [noteBody, setNoteBody] = useState(
    "The kind of photo sequence that feels better once it has room to breathe in print.",
  );
  const [activeResolutionTaskId, setActiveResolutionTaskId] = useState<string | null>(
    null,
  );
  const [activeResolutionProjectId, setActiveResolutionProjectId] = useState<string | null>(
    null,
  );
  const [resolutionLocationInput, setResolutionLocationInput] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function hydrate() {
      try {
        const raw = await localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          return;
        }

        const parsed = JSON.parse(raw) as {
          activeTab?: AppTab;
          projects?: Project[];
          selectedProjectId?: string;
          testerEmail?: string;
          testerName?: string;
        };

        if (!isMounted) {
          return;
        }

        if (parsed.projects?.length) {
          setProjects(parsed.projects);
        }
        if (parsed.selectedProjectId) {
          setSelectedProjectId(parsed.selectedProjectId);
        }
        if (parsed.activeTab) {
          setActiveTab(parsed.activeTab);
        }
        if (parsed.testerName) {
          setTesterName(parsed.testerName);
        }
        if (parsed.testerEmail) {
          setTesterEmail(parsed.testerEmail);
        }
      } catch {
        // Ignore stale cache and fall back to seeded data.
      } finally {
        if (isMounted) {
          setHasHydrated(true);
        }
      }
    }

    void hydrate();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    void localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        activeTab,
        projects,
        selectedProjectId,
        testerName,
        testerEmail,
      }),
    );
  }, [activeTab, hasHydrated, projects, selectedProjectId, testerEmail, testerName]);

  useEffect(() => {
    if (!isSupabaseAuthConfigured || !authClient) {
      setAuthReady(true);
      return;
    }

    let isMounted = true;

    async function hydrateAuth() {
      const identity = await getCurrentAuthIdentity().catch(() => null);
      if (!isMounted) {
        return;
      }

      setAuthIdentity(identity);
      setAuthReady(true);
    }

    void hydrateAuth();

    const subscription = authClient.auth.onAuthStateChange((_event, session) => {
      const identity = session?.user ? getAuthIdentityFromUser(session.user) : null;

      setAuthIdentity(identity);
      setAuthReady(true);
    });

    return () => {
      isMounted = false;
      subscription.data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authIdentity) {
      return;
    }

    setTesterName(authIdentity.name);
    setTesterEmail(authIdentity.email);
    setAuthNameInput(authIdentity.name);
    setAuthEmailInput(authIdentity.email);
  }, [authIdentity]);

  useEffect(() => {
    if (!hasHydrated || (isSupabaseAuthConfigured && (!authReady || !authIdentity))) {
      return;
    }

    async function loadRemoteProjects() {
      try {
        const remoteProjects = await fetchProjectsRemote();
        if (!remoteProjects) {
          setSyncMode("local");
          return;
        }

        applySharedProjects(remoteProjects);
      } catch {
        // Stay in local-first mode if the shared API is unavailable.
        setSyncMode("local");
      }
    }

    void loadRemoteProjects();
  }, [authIdentity, authReady, hasHydrated]);

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const openTasks = listOpenTasks(projects);
  const totalPages = projects.reduce(
    (sum, project) => sum + project.bookDraft.pages.length,
    0,
  );
  const safeCalendarYear = Number.isFinite(Number.parseInt(draftCalendarYear, 10))
    ? Number.parseInt(draftCalendarYear, 10)
    : Number(draftStartDate.slice(0, 4));
  const resolvedApiBaseUrl = getResolvedApiBaseUrl();
  const syncSummary =
    syncMode === "shared"
      ? `Shared account mode${lastSyncedAt ? ` - synced ${lastSyncedAt}` : ""}`
      : syncMode === "local"
        ? "Local-only mode"
        : "Checking shared store";
  const featuredPhoto = selectedProject ? getProjectCoverPhoto(selectedProject) : undefined;
  const featuredSummary = selectedProject ? getProjectSummary(selectedProject) : null;
  const testerId =
    testerEmail.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "tester";
  const plannedProjectDates =
    draftType === "yearbook"
      ? draftYearbookCycle === "calendar_year"
        ? buildCalendarYearRange(safeCalendarYear)
        : {
            startDate: draftAnniversaryDate,
            endDate: buildAnniversaryYearEndDate(draftAnniversaryDate),
          }
      : {
          startDate: draftStartDate,
          endDate: draftEndDate,
        };
  const plannedYearbookWindow =
    draftType === "yearbook"
      ? `${new Date(`${plannedProjectDates.startDate}T12:00:00`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })} to ${new Date(`${plannedProjectDates.endDate}T12:00:00`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}`
      : null;

  function replaceProject(updatedProject: Project) {
    setProjects((current) =>
      current.map((project) =>
        project.id === updatedProject.id ? updatedProject : project,
      ),
    );
  }

  function getCurrentMemberId(project: Project) {
    return (
      project.members.find(
        (member) => member.email.toLowerCase() === testerEmail.toLowerCase(),
      )?.id ?? testerId
    );
  }

  function getProjectById(projectId: string) {
    return projects.find((project) => project.id === projectId);
  }

  function getLocationDraftForTask(projectId: string, taskId: string) {
    const project = getProjectById(projectId);
    if (!project) {
      return "";
    }

    const photoId = getPhotoIdForTask(taskId);
    if (!photoId) {
      return "";
    }

    return (
      project.photos.find((photo) => photo.id === photoId)?.locationLabel ?? ""
    );
  }

  function markSharedSync() {
    setSyncMode("shared");
    setLastSyncedAt(
      new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    );
  }

  function applySharedProjects(remoteProjects: Project[]) {
    setProjects(remoteProjects);
    setSelectedProjectId((current) =>
      remoteProjects.some((project) => project.id === current)
        ? current
        : remoteProjects[0]?.id ?? "",
    );
    markSharedSync();
  }

  async function handleAuthSubmit() {
    if (!authClient || authBusy) {
      return;
    }

    setAuthBusy(true);
    setAuthError(null);

    const email = authEmailInput.trim().toLowerCase();
    const password = authPasswordInput;

    try {
      if (authMode === "sign_in") {
        const { error } = await authClient.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setAuthError(error.message);
        }
        return;
      }

      const { data, error } = await authClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: authNameInput.trim(),
          },
        },
      });

      if (error) {
        setAuthError(error.message);
        return;
      }

      if (!data.session) {
        setAuthError(
          "Your account was created, but Supabase still wants email verification. Verify the email or temporarily disable Confirm email in Supabase Auth settings for testing.",
        );
      }
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    if (!authClient) {
      return;
    }

    await authClient.auth.signOut();
    setAuthIdentity(null);
    setProjects([]);
    setSelectedProjectId("");
    setSyncMode("checking");
    setLastSyncedAt(null);
    setAuthPasswordInput("");
  }

  async function handleCreateProject() {
    const newProject = createMockProject({
      type: draftType,
      title: draftTitle,
      subtitle: draftSubtitle,
      startDate: plannedProjectDates.startDate,
      endDate: plannedProjectDates.endDate,
      timezone: "America/Denver",
      ownerName: testerName,
      ownerEmail: testerEmail,
      yearbookCycle: draftType === "yearbook" ? draftYearbookCycle : undefined,
      anniversaryDate:
        draftType === "yearbook" && draftYearbookCycle !== "calendar_year"
          ? draftAnniversaryDate
          : undefined,
    });
    const remoteProject = await createProjectRemote({
      type: draftType,
      title: draftTitle,
      subtitle: draftSubtitle,
      startDate: plannedProjectDates.startDate,
      endDate: plannedProjectDates.endDate,
      timezone: "America/Denver",
      ownerName: testerName,
      ownerEmail: testerEmail,
      yearbookCycle: draftType === "yearbook" ? draftYearbookCycle : undefined,
      anniversaryDate:
        draftType === "yearbook" && draftYearbookCycle !== "calendar_year"
          ? draftAnniversaryDate
          : undefined,
    }).catch(() => null);
    const projectToUse = remoteProject ?? newProject;

    if (remoteProject) {
      markSharedSync();
    } else {
      setSyncMode("local");
    }

    startTransition(() => {
      setProjects((current) => [projectToUse, ...current.filter((item) => item.id !== projectToUse.id)]);
      setSelectedProjectId(projectToUse.id);
      setActiveTab("projects");
    });
  }

  async function handleInviteCollaborator() {
    if (!selectedProject) {
      return;
    }

    const localProject = addCollaborator(selectedProject, {
      name: inviteName,
      email: inviteEmail,
    });
    const remoteProject = await inviteCollaboratorRemote(selectedProject.id, {
      name: inviteName,
      email: inviteEmail,
    }).catch(() => null);

    if (remoteProject) {
      markSharedSync();
    }

    replaceProject(remoteProject ?? localProject);
    setInviteName("New friend");
    setInviteEmail("friend@example.com");
  }

  function handleStartTaskResolution(task: OpenTask) {
    if (task.type === "location") {
      setActiveResolutionTaskId(task.id);
      setActiveResolutionProjectId(task.projectId);
      setResolutionLocationInput(getLocationDraftForTask(task.projectId, task.id));
      return;
    }

    void handleResolveTask(task.projectId, task.id);
  }

  function handleCancelTaskResolution() {
    setActiveResolutionTaskId(null);
    setActiveResolutionProjectId(null);
    setResolutionLocationInput("");
  }

  async function handleResolveTask(
    projectId: string,
    taskId: string,
    input?: { locationLabel?: string },
  ) {
    const project = getProjectById(projectId);
    if (!project) {
      return;
    }

    const task = project.resolutionTasks.find((entry) => entry.id === taskId);
    const trimmedLocation = input?.locationLabel?.trim();
    if (task?.type === "location" && !trimmedLocation) {
      Alert.alert(
        "Add the location first",
        "Type the place name or town for this photo before marking the task resolved.",
      );
      return;
    }

    const localProject = resolveProjectTask(project, taskId, {
      locationLabel: trimmedLocation,
    });
    const remoteProject = await resolveTaskRemote(projectId, taskId, {
      locationLabel: trimmedLocation,
    }).catch(() => null);
    if (remoteProject) {
      markSharedSync();
    }
    replaceProject(remoteProject ?? localProject);
    if (selectedProjectId === projectId) {
      setSelectedProjectId(projectId);
    }
    handleCancelTaskResolution();
  }

  async function handleTogglePage(pageId: string) {
    if (!selectedProject) {
      return;
    }

    const localProject = togglePageApproval(selectedProject, pageId);
    const remoteProject = await togglePageApprovalRemote(
      selectedProject.id,
      pageId,
    ).catch(() => null);
    if (remoteProject) {
      markSharedSync();
    }
    replaceProject(remoteProject ?? localProject);
  }

  async function handleUpdatePageCopy(
    pageId: string,
    input: { title: string; caption: string; confirmed?: boolean },
  ) {
    if (!selectedProject) {
      return;
    }

    const localProject = updateBookPageCopy(selectedProject, pageId, input);
    const remoteProject = await updatePageCopyRemote(selectedProject.id, pageId, input).catch(
      () => null,
    );
    if (remoteProject) {
      markSharedSync();
    }
    replaceProject(remoteProject ?? localProject);
  }

  async function handleToggleMustInclude(photoId: string) {
    if (!selectedProject) {
      return;
    }

    const localProject = toggleMustIncludePhoto(selectedProject, photoId);
    const remoteProject = await toggleMustIncludeRemote(
      selectedProject.id,
      photoId,
    ).catch(() => null);
    if (remoteProject) {
      markSharedSync();
    }
    replaceProject(remoteProject ?? localProject);
  }

  async function handleThemeSelect(themeId: string) {
    if (!selectedProject) {
      return;
    }

    const localProject = {
      ...selectedProject,
      selectedThemeId: themeId,
      bookDraft: {
        ...selectedProject.bookDraft,
        themeId,
      },
    };
    const remoteProject = await setThemeRemote(selectedProject.id, themeId).catch(
      () => null,
    );
    if (remoteProject) {
      markSharedSync();
    }
    replaceProject(remoteProject ?? localProject);
  }

  async function handleAdvancePrintOrder() {
    if (!selectedProject) {
      return;
    }

    const localProject = cyclePrintOrder(selectedProject);
    const remoteProject = await advancePrintOrderRemote(selectedProject.id).catch(
      () => null,
    );
    if (remoteProject) {
      markSharedSync();
    }
    replaceProject(remoteProject ?? localProject);
  }

  async function handleFinalizeProject() {
    if (!selectedProject) {
      return;
    }

    const localProject = finalizeProject(selectedProject);
    const remoteProject = await finalizeProjectRemote(selectedProject.id).catch(
      () => null,
    );
    if (remoteProject) {
      markSharedSync();
    }
    replaceProject(remoteProject ?? localProject);
    setActiveTab("print");
  }

  async function handlePickPhotos() {
    if (!selectedProject) {
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photo access needed",
        "Grant library access so Photo Book Maker can import trip photos.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
      exif: true,
      quality: 1,
    });

    if (result.canceled || !result.assets.length) {
      return;
    }

    const importedPhotos = await Promise.all(
      result.assets.map(async (asset, index) => {
        const capturedAt =
          parseExifDateTime(asset.exif?.DateTimeOriginal) ??
          parseExifDateTime(asset.exif?.DateTimeDigitized) ??
          parseExifDateTime(asset.exif?.DateTime) ??
          new Date().toISOString();
        const latitude = parseExifCoordinate(
          asset.exif?.GPSLatitude,
          asset.exif?.GPSLatitudeRef,
        );
        const longitude = parseExifCoordinate(
          asset.exif?.GPSLongitude,
          asset.exif?.GPSLongitudeRef,
        );
        const hasExactGps =
          typeof latitude === "number" && typeof longitude === "number";
        const gpsLabel = hasExactGps
          ? `GPS ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
          : undefined;
        const locationConfidence: "exact" | "missing" = hasExactGps
          ? "exact"
          : "missing";
        const contentType = asset.mimeType ?? "image/jpeg";
        const fileName =
          asset.fileName ?? `imported-${Date.now()}-${index}.${contentType.split("/")[1] ?? "jpg"}`;
        const remoteUpload =
          hasRemoteApi() && !asset.uri.startsWith("http")
            ? await createPhotoUploadTicketRemote(selectedProject.id, {
                fileName,
                contentType,
              })
                .then((upload) =>
                  upload ? uploadFileToRemoteStorage(upload, asset.uri) : null,
                )
                .catch(() => null)
            : null;

        return {
          title: fileName.replace(/\.[^.]+$/, "") || `Imported photo ${index + 1}`,
          uri: remoteUpload?.downloadUrl ?? asset.uri,
          storagePath: remoteUpload?.storagePath,
          mimeType: remoteUpload?.mimeType ?? contentType,
          width: asset.width ?? 1600,
          height: asset.height ?? 1200,
          capturedAt,
          locationLabel: gpsLabel,
          locationConfidence,
          qualityNotes: [
            "Imported from device library.",
            remoteUpload
              ? "Uploaded to remote photo storage."
              : "Stored locally in tester mode.",
            hasExactGps
              ? "GPS metadata detected during import."
              : "No GPS metadata found during import.",
          ],
          uploaderId: getCurrentMemberId(selectedProject),
        };
      }),
    );
    const localProject = addPhotosToProject(selectedProject, importedPhotos);
    const remoteProject = await addPhotosRemote(selectedProject.id, importedPhotos).catch(
      () => null,
    );
    if (remoteProject) {
      markSharedSync();
    }
    replaceProject(remoteProject ?? localProject);
  }

  async function handleAddNote() {
    if (!selectedProject || !noteTitle.trim() || !noteBody.trim()) {
      return;
    }

    const input = {
      authorId: getCurrentMemberId(selectedProject),
      title: noteTitle.trim(),
      body: noteBody.trim(),
    };
    const localProject = addNoteToProject(selectedProject, input);
    const remoteProject = await addNoteRemote(selectedProject.id, input).catch(
      () => null,
    );
    if (remoteProject) {
      markSharedSync();
    }
    replaceProject(remoteProject ?? localProject);
    setNoteTitle("What this moment felt like");
    setNoteBody("Capture the atmosphere here so the recap page has real memory, not filler.");
  }

  async function handleRefreshProjects() {
    const remoteProjects = await fetchProjectsRemote().catch(() => null);

    if (remoteProjects) {
      applySharedProjects(remoteProjects);
      return;
    }

    setSyncMode("local");
    Alert.alert(
      "Shared store unavailable",
      "The app is still usable locally, but another tester will not see changes until the shared API is reachable.",
    );
  }

  async function handleExportProof() {
    if (!selectedProject) {
      return;
    }

    const { uri } = await Print.printToFileAsync({
      html: buildProofHtml(selectedProject),
      base64: false,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `${selectedProject.title} proof export`,
      });
      return;
    }

    Alert.alert("Proof exported", uri);
  }

  if (!authReady) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.authLoadingScreen}>
          <ActivityIndicator size="large" color={palette.accent} />
          <Text style={styles.authLoadingTitle}>Checking your account</Text>
          <Text style={styles.authLoadingBody}>
            Restoring your Supabase session before we load your book library.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isSupabaseAuthConfigured && !authIdentity) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          style={styles.appShell}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <AuthScreen
              mode={authMode}
              busy={authBusy}
              error={authError}
              name={authNameInput}
              email={authEmailInput}
              password={authPasswordInput}
              onModeChange={setAuthMode}
              onNameChange={setAuthNameInput}
              onEmailChange={setAuthEmailInput}
              onPasswordChange={setAuthPasswordInput}
              onSubmit={handleAuthSubmit}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.appShell}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <View style={styles.heroHeaderRow}>
              <View style={styles.heroCopy}>
                <Text style={styles.eyebrow}>Photo Book Maker</Text>
                <Text style={styles.heroTitle}>
                  A shared phone-first library for the trips worth printing.
                </Text>
                <Text style={styles.heroBody}>
                  Upload together, keep the story in order, and shape each trip or annual
                  book into something that already feels professionally laid out.
                </Text>
                <Text style={styles.syncSummary}>
                  {syncSummary}
                  {resolvedApiBaseUrl ? ` - API ${resolvedApiBaseUrl}` : ""}
                </Text>
              </View>

              {selectedProject ? (
                <View style={styles.heroProjectCard}>
                  {featuredPhoto?.imageUri ? (
                    <Image
                      source={{ uri: featuredPhoto.imageUri }}
                      style={styles.heroProjectImage}
                    />
                  ) : (
                    <View style={styles.heroProjectPlaceholder}>
                      <Text style={styles.heroProjectPlaceholderText}>
                        {selectedProject.type === "trip" ? "Trip book" : "Yearbook"}
                      </Text>
                    </View>
                  )}
                  <View style={styles.heroProjectOverlay} />
                  <View style={styles.heroProjectMeta}>
                    <Text style={styles.heroProjectEyebrow}>
                      {getProjectStageLabel(selectedProject)}
                    </Text>
                    <Text style={styles.heroProjectTitle}>{selectedProject.title}</Text>
                    <Text style={styles.heroProjectRange}>
                      {formatProjectRange(selectedProject)}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>

            <View style={styles.heroStats}>
              <StatCard label="Books" value={projects.length} />
              <StatCard label="Open fixes" value={openTasks.length} />
              <StatCard label="Pages drafted" value={totalPages} />
              <StatCard
                label="Selected photos"
                value={featuredSummary?.approvedPhotos ?? 0}
              />
            </View>
            <View style={styles.inlineActionRow}>
              <PrimaryButton
                label="Refresh shared state"
                onPress={handleRefreshProjects}
                compact
              />
            </View>
          </View>

          {activeTab === "projects" ? (
            <ProjectsTab
              projects={projects}
              selectedProject={selectedProject}
              draftType={draftType}
              draftYearbookCycle={draftYearbookCycle}
              draftCalendarYear={draftCalendarYear}
              draftAnniversaryDate={draftAnniversaryDate}
              plannedYearbookWindow={plannedYearbookWindow}
              draftTitle={draftTitle}
              draftSubtitle={draftSubtitle}
              draftStartDate={draftStartDate}
              draftEndDate={draftEndDate}
              testerProfileLocked={Boolean(authIdentity)}
              testerName={testerName}
              testerEmail={testerEmail}
              inviteName={inviteName}
              inviteEmail={inviteEmail}
              noteTitle={noteTitle}
              noteBody={noteBody}
              onDraftTypeChange={setDraftType}
              onDraftYearbookCycleChange={setDraftYearbookCycle}
              onDraftCalendarYearChange={setDraftCalendarYear}
              onDraftAnniversaryDateChange={setDraftAnniversaryDate}
              onDraftTitleChange={setDraftTitle}
              onDraftSubtitleChange={setDraftSubtitle}
              onDraftStartDateChange={setDraftStartDate}
              onDraftEndDateChange={setDraftEndDate}
              onTesterNameChange={setTesterName}
              onTesterEmailChange={setTesterEmail}
              onInviteNameChange={setInviteName}
              onInviteEmailChange={setInviteEmail}
              onNoteTitleChange={setNoteTitle}
              onNoteBodyChange={setNoteBody}
              onSignOut={handleSignOut}
              onCreateProject={handleCreateProject}
              onInviteCollaborator={handleInviteCollaborator}
              onAddNote={handleAddNote}
              onPickPhotos={handlePickPhotos}
              onOpenEditor={() => setActiveTab("editor")}
              onSelectProject={(projectId) => {
                startTransition(() => {
                  setSelectedProjectId(projectId);
                });
              }}
              onToggleMustInclude={handleToggleMustInclude}
            />
          ) : null}

          {activeTab === "tasks" ? (
            <TasksTab
              tasks={openTasks}
              activeResolutionTaskId={activeResolutionTaskId}
              activeResolutionProjectId={activeResolutionProjectId}
              resolutionLocationInput={resolutionLocationInput}
              onLocationInputChange={setResolutionLocationInput}
              onResolveTask={handleResolveTask}
              onStartTaskResolution={handleStartTaskResolution}
              onCancelTaskResolution={handleCancelTaskResolution}
            />
          ) : null}

          {activeTab === "editor" ? (
            <MobileEditorTab
              project={selectedProject}
              onTogglePage={handleTogglePage}
              onUpdatePageCopy={handleUpdatePageCopy}
              onThemeSelect={handleThemeSelect}
              onExportProof={handleExportProof}
            />
          ) : null}

          {activeTab === "print" ? (
            <PrintTab
              project={selectedProject}
              onAdvancePrintOrder={handleAdvancePrintOrder}
              onFinalizeProject={handleFinalizeProject}
              onExportProof={handleExportProof}
            />
          ) : null}
        </ScrollView>

        <View style={styles.bottomDock}>
          {tabOrder.map((tab) => (
            <Pressable
              key={tab}
              style={[
                styles.dockButton,
                activeTab === tab ? styles.dockButtonActive : null,
              ]}
              onPress={() => {
                startTransition(() => setActiveTab(tab));
              }}
            >
              <Text
                style={[
                  styles.dockButtonText,
                  activeTab === tab ? styles.dockButtonTextActive : null,
                ]}
              >
                {tabLabels[tab]}
              </Text>
            </Pressable>
          ))}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ProjectsTab({
  projects,
  selectedProject,
  draftType,
  draftYearbookCycle,
  draftCalendarYear,
  draftAnniversaryDate,
  plannedYearbookWindow,
  draftTitle,
  draftSubtitle,
  draftStartDate,
  draftEndDate,
  testerProfileLocked,
  testerName,
  testerEmail,
  inviteName,
  inviteEmail,
  noteTitle,
  noteBody,
  onDraftTypeChange,
  onDraftYearbookCycleChange,
  onDraftCalendarYearChange,
  onDraftAnniversaryDateChange,
  onDraftTitleChange,
  onDraftSubtitleChange,
  onDraftStartDateChange,
  onDraftEndDateChange,
  onTesterNameChange,
  onTesterEmailChange,
  onInviteNameChange,
  onInviteEmailChange,
  onNoteTitleChange,
  onNoteBodyChange,
  onSignOut,
  onCreateProject,
  onInviteCollaborator,
  onAddNote,
  onPickPhotos,
  onOpenEditor,
  onSelectProject,
  onToggleMustInclude,
}: {
  projects: Project[];
  selectedProject?: Project;
  draftType: ProjectType;
  draftYearbookCycle: YearbookCycle;
  draftCalendarYear: string;
  draftAnniversaryDate: string;
  plannedYearbookWindow: string | null;
  draftTitle: string;
  draftSubtitle: string;
  draftStartDate: string;
  draftEndDate: string;
  testerProfileLocked: boolean;
  testerName: string;
  testerEmail: string;
  inviteName: string;
  inviteEmail: string;
  noteTitle: string;
  noteBody: string;
  onDraftTypeChange: (value: ProjectType) => void;
  onDraftYearbookCycleChange: (value: YearbookCycle) => void;
  onDraftCalendarYearChange: (value: string) => void;
  onDraftAnniversaryDateChange: (value: string) => void;
  onDraftTitleChange: (value: string) => void;
  onDraftSubtitleChange: (value: string) => void;
  onDraftStartDateChange: (value: string) => void;
  onDraftEndDateChange: (value: string) => void;
  onTesterNameChange: (value: string) => void;
  onTesterEmailChange: (value: string) => void;
  onInviteNameChange: (value: string) => void;
  onInviteEmailChange: (value: string) => void;
  onNoteTitleChange: (value: string) => void;
  onNoteBodyChange: (value: string) => void;
  onSignOut: () => void;
  onCreateProject: () => void;
  onInviteCollaborator: () => void;
  onAddNote: () => void;
  onPickPhotos: () => void;
  onOpenEditor: () => void;
  onSelectProject: (projectId: string) => void;
  onToggleMustInclude: (photoId: string) => void;
}) {
  const workingProjects = projects.filter((project) => project.status !== "printed");
  const archivedProjects = projects.filter((project) => project.status === "printed");
  const leftColumnProjects = workingProjects.filter((_, index) => index % 2 === 0);
  const rightColumnProjects = workingProjects.filter((_, index) => index % 2 === 1);
  const featuredProject = selectedProject ?? projects[0];
  const featuredSummary = featuredProject ? getProjectSummary(featuredProject) : null;

  return (
    <View style={styles.sectionStack}>
      <SurfaceCard
        title="Your book board"
        subtitle="Library"
        body="Trips and yearly books stay in one visual board so you can see what is still collecting, what needs fixes, and what is almost ready to print."
      >
        <View style={styles.libraryPillRow}>
          <LibraryPill label="Working" value={workingProjects.length} />
          <LibraryPill label="Printed" value={archivedProjects.length} />
          <LibraryPill label="Open fixes" value={projects.flatMap((project) => project.resolutionTasks).filter((task) => task.status !== "resolved").length} />
        </View>

        {featuredProject && featuredSummary ? (
          <View style={styles.featuredWorkspace}>
            <View style={styles.featuredWorkspaceCopy}>
              <Text style={styles.featuredWorkspaceEyebrow}>Selected book</Text>
              <Text style={styles.featuredWorkspaceTitle}>{featuredProject.title}</Text>
              <Text style={styles.featuredWorkspaceBody}>
                {featuredProject.subtitle}
              </Text>
              <Text style={styles.featuredWorkspaceMeta}>
                {formatProjectRange(featuredProject)} - {featuredSummary.pageCount} draft pages -{" "}
                {featuredSummary.mustIncludePhotos} must-include moments
              </Text>
            </View>

            <View style={styles.featuredWorkspaceActions}>
              <PrimaryButton label="Import photos" onPress={onPickPhotos} compact />
              <PrimaryButton label="Open layout" onPress={onOpenEditor} compact />
              <PrimaryButton label="Save note" onPress={onAddNote} compact dark />
            </View>
          </View>
        ) : null}

        <View style={styles.boardColumns}>
          <View style={styles.boardColumn}>
            {leftColumnProjects.map((project, index) => (
              <BookTile
                key={project.id}
                project={project}
                isSelected={project.id === selectedProject?.id}
                tall={index % 2 === 0}
                onPress={() => onSelectProject(project.id)}
              />
            ))}
          </View>
          <View style={styles.boardColumn}>
            {rightColumnProjects.map((project, index) => (
              <BookTile
                key={project.id}
                project={project}
                isSelected={project.id === selectedProject?.id}
                tall={index % 2 !== 0}
                onPress={() => onSelectProject(project.id)}
              />
            ))}
          </View>
        </View>

        {archivedProjects.length ? (
          <View style={styles.archiveShelf}>
            <Text style={styles.archiveShelfTitle}>Printed shelf</Text>
            <View style={styles.archiveRow}>
              {archivedProjects.map((project) => (
                <BookTile
                  key={project.id}
                  project={project}
                  isSelected={project.id === selectedProject?.id}
                  compact
                  onPress={() => onSelectProject(project.id)}
                />
              ))}
            </View>
          </View>
        ) : (
          <Text style={styles.archiveHint}>
            Printed books will collect here once your first order ships, so the active board stays focused on what still needs attention.
          </Text>
        )}
      </SurfaceCard>

      <SurfaceCard
        title="Create a new project"
        subtitle="Start on phone"
        body="Start a trip for one weekend or a yearbook that rolls on a calendar year, dating anniversary, or wedding anniversary."
      >
        {testerProfileLocked ? (
          <View style={styles.accountCard}>
            <View style={styles.accountCardCopy}>
              <Text style={styles.accountCardEyebrow}>Signed in account</Text>
              <Text style={styles.accountCardTitle}>{testerName}</Text>
              <Text style={styles.accountCardBody}>{testerEmail}</Text>
            </View>
            <PrimaryButton label="Sign out" onPress={onSignOut} compact dark />
          </View>
        ) : null}
        <Field
          label="Your name"
          value={testerName}
          onChangeText={onTesterNameChange}
          editable={!testerProfileLocked}
        />
        <Field
          label="Your email"
          value={testerEmail}
          onChangeText={onTesterEmailChange}
          editable={!testerProfileLocked}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Text style={styles.helperText}>
          {testerProfileLocked
            ? "Project ownership now comes from your real Supabase account, so these fields stay locked to avoid drift."
            : "Use the same email on each phone that you plan to invite into the project so uploads and notes are attributed to the right person."}
        </Text>
        <View style={styles.segmentedRow}>
          {(["trip", "yearbook"] as ProjectType[]).map((type) => (
            <Pressable
              key={type}
              onPress={() => onDraftTypeChange(type)}
              style={[
                styles.segmentChip,
                draftType === type ? styles.segmentChipActive : null,
              ]}
            >
              <Text
                style={[
                  styles.segmentChipText,
                  draftType === type ? styles.segmentChipTextActive : null,
                ]}
              >
                {type}
              </Text>
            </Pressable>
          ))}
        </View>

        {draftType === "yearbook" ? (
          <>
            <View style={styles.segmentedRow}>
              {(
                [
                  "calendar_year",
                  "dating_anniversary",
                  "wedding_anniversary",
                ] as YearbookCycle[]
              ).map((cycle) => (
                <Pressable
                  key={cycle}
                  onPress={() => onDraftYearbookCycleChange(cycle)}
                  style={[
                    styles.segmentChip,
                    draftYearbookCycle === cycle ? styles.segmentChipActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentChipText,
                      draftYearbookCycle === cycle ? styles.segmentChipTextActive : null,
                    ]}
                  >
                    {getYearbookCycleLabel(cycle)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {draftYearbookCycle === "calendar_year" ? (
              <Field
                label="Calendar year"
                value={draftCalendarYear}
                onChangeText={onDraftCalendarYearChange}
              />
            ) : (
              <>
                <Field
                  label="Anniversary date"
                  value={draftAnniversaryDate}
                  onChangeText={onDraftAnniversaryDateChange}
                />
                <Text style={styles.helperText}>
                  This yearbook will cover {plannedYearbookWindow}.
                </Text>
              </>
            )}
          </>
        ) : null}

        <Field label="Project title" value={draftTitle} onChangeText={onDraftTitleChange} />
        <Field
          label="Subtitle"
          value={draftSubtitle}
          onChangeText={onDraftSubtitleChange}
          multiline
        />
        {draftType === "trip" ? (
          <View style={styles.inlineFields}>
            <Field
              label="Start"
              value={draftStartDate}
              onChangeText={onDraftStartDateChange}
              compact
            />
            <Field
              label="End"
              value={draftEndDate}
              onChangeText={onDraftEndDateChange}
              compact
            />
          </View>
        ) : (
          <Text style={styles.helperText}>
            Planned book window: {plannedYearbookWindow}
          </Text>
        )}
        <PrimaryButton label="Create project" onPress={onCreateProject} />
      </SurfaceCard>

      {selectedProject ? (
        <>
          <SurfaceCard
            title={`${selectedProject.title} workspace`}
            subtitle="Capture and curation"
            body="Keep the selected book moving by importing more photos, saving memory notes, and promoting the frames that really have to make the final cut."
          >
            <View style={styles.inlineActionRow}>
              <PrimaryButton label="Import from library" onPress={onPickPhotos} />
              <PrimaryButton label="Open draft layout" onPress={onOpenEditor} compact />
              <PrimaryButton label="Add note" onPress={onAddNote} compact dark />
            </View>
            <Field
              label="Note title"
              value={noteTitle}
              onChangeText={onNoteTitleChange}
            />
            <Field
              label="Memory note"
              value={noteBody}
              onChangeText={onNoteBodyChange}
              multiline
            />
            <View style={styles.galleryHeader}>
              <View style={styles.galleryHeaderCopy}>
                <Text style={styles.galleryTitle}>Every photo in this book</Text>
                <Text style={styles.galleryBody}>
                  This is the full import gallery. The Layout tab below shows how the draft
                  is currently using these frames.
                </Text>
              </View>
              <Text style={styles.galleryCount}>{selectedProject.photos.length} photos</Text>
            </View>
            <View style={styles.photoGrid}>
              {selectedProject.photos.map((photo) => (
                <View key={photo.id} style={styles.photoCard}>
                  {photo.imageUri ? (
                    <Image source={{ uri: photo.imageUri }} style={styles.photoThumb} />
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <Text style={styles.photoPlaceholderText}>
                        {photo.orientation}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.photoTitle}>{photo.title}</Text>
                  <Text style={styles.photoMeta}>
                    {photo.locationLabel ?? "Needs location"} - {photo.orientation}
                  </Text>
                  <Pressable
                    style={[
                      styles.inlineButton,
                      photo.mustInclude ? styles.inlineButtonApproved : null,
                    ]}
                    onPress={() => onToggleMustInclude(photo.id)}
                  >
                    <Text
                      style={[
                        styles.inlineButtonText,
                        photo.mustInclude ? styles.inlineButtonTextApproved : null,
                      ]}
                    >
                      {photo.mustInclude ? "Must include" : "Make must include"}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </SurfaceCard>

          <SurfaceCard
            title={`${selectedProject.title} collaborators`}
            subtitle="Invite workflow"
            body="Only the owner finalizes, but collaborators can upload, tag, and resolve blockers."
          >
            <View style={styles.memberGrid}>
              {selectedProject.members.map((member) => (
                <View key={member.id} style={styles.memberCard}>
                  <Text style={styles.memberInitial}>{member.avatarLabel}</Text>
                  <View style={styles.memberMeta}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <Text style={styles.memberEmail}>{member.email}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Field
              label="Invite name"
              value={inviteName}
              onChangeText={onInviteNameChange}
            />
            <Field
              label="Invite email"
              value={inviteEmail}
              onChangeText={onInviteEmailChange}
            />
            <PrimaryButton label="Send mock invite" onPress={onInviteCollaborator} />
          </SurfaceCard>
        </>
      ) : null}
    </View>
  );
}

function AuthScreen({
  mode,
  busy,
  error,
  name,
  email,
  password,
  onModeChange,
  onNameChange,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: {
  mode: "sign_in" | "sign_up";
  busy: boolean;
  error: string | null;
  name: string;
  email: string;
  password: string;
  onModeChange: (mode: "sign_in" | "sign_up") => void;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const isSignUp = mode === "sign_up";

  return (
    <View style={styles.sectionStack}>
      <View style={styles.heroCard}>
        <View style={styles.heroHeaderRow}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>Owner account</Text>
            <Text style={styles.heroTitle}>
              Sign in before you start building real trip books.
            </Text>
            <Text style={styles.heroBody}>
              This first pass uses a single Supabase account so your phone is tied to a
              real owner identity instead of the old tester-only profile fields.
            </Text>
          </View>
        </View>
      </View>

      <SurfaceCard
        title={isSignUp ? "Create your owner account" : "Sign in to your account"}
        subtitle="Supabase auth"
        body="Use email and password for now. Once this is stable, we can replace it with invite links and collaborator onboarding."
      >
        <View style={styles.segmentedRow}>
          {(["sign_in", "sign_up"] as const).map((authMode) => (
            <Pressable
              key={authMode}
              onPress={() => onModeChange(authMode)}
              style={[
                styles.segmentChip,
                mode === authMode ? styles.segmentChipActive : null,
              ]}
            >
              <Text
                style={[
                  styles.segmentChipText,
                  mode === authMode ? styles.segmentChipTextActive : null,
                ]}
              >
                {authMode === "sign_in" ? "Sign in" : "Create account"}
              </Text>
            </Pressable>
          ))}
        </View>

        {isSignUp ? (
          <Field label="Your name" value={name} onChangeText={onNameChange} />
        ) : null}
        <Field
          label="Email"
          value={email}
          onChangeText={onEmailChange}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={onPasswordChange}
          secureTextEntry
          autoCapitalize="none"
        />
        {error ? <Text style={styles.authErrorText}>{error}</Text> : null}
        <PrimaryButton
          label={
            busy
              ? isSignUp
                ? "Creating account..."
                : "Signing in..."
              : isSignUp
                ? "Create account"
                : "Sign in"
          }
          onPress={onSubmit}
        />
      </SurfaceCard>
    </View>
  );
}

function TasksTab({
  tasks,
  activeResolutionTaskId,
  activeResolutionProjectId,
  resolutionLocationInput,
  onLocationInputChange,
  onResolveTask,
  onStartTaskResolution,
  onCancelTaskResolution,
}: {
  tasks: ReturnType<typeof listOpenTasks>;
  activeResolutionTaskId: string | null;
  activeResolutionProjectId: string | null;
  resolutionLocationInput: string;
  onLocationInputChange: (value: string) => void;
  onResolveTask: (
    projectId: string,
    taskId: string,
    input?: { locationLabel?: string },
  ) => void;
  onStartTaskResolution: (task: OpenTask) => void;
  onCancelTaskResolution: () => void;
}) {
  return (
    <SurfaceCard
      title="Resolution queue"
      subtitle="Export blockers"
      body="Location gaps, unknown face clusters, and ordering ambiguity all stop the final export until somebody fixes them."
    >
      <View style={styles.cardStack}>
        {tasks.map((task) => (
          <View key={task.id} style={styles.taskCard}>
            <Text style={styles.taskEyebrow}>
              {task.projectTitle} - {task.type}
            </Text>
            <Text style={styles.taskTitle}>{task.title}</Text>
            <Text style={styles.taskBody}>{task.detail}</Text>
            {activeResolutionTaskId === task.id &&
            activeResolutionProjectId === task.projectId &&
            task.type === "location" ? (
              <View style={styles.taskResolutionEditor}>
                <Field
                  label="Confirmed location"
                  value={resolutionLocationInput}
                  onChangeText={onLocationInputChange}
                />
                <Text style={styles.helperText}>
                  Use the place name people would expect in the book, like a park, trail,
                  town, or neighborhood.
                </Text>
                <View style={styles.inlineActionRow}>
                  <PrimaryButton
                    label="Save location"
                    onPress={() =>
                      onResolveTask(task.projectId, task.id, {
                        locationLabel: resolutionLocationInput,
                      })
                    }
                    compact
                  />
                  <PrimaryButton
                    label="Cancel"
                    onPress={onCancelTaskResolution}
                    compact
                    dark
                  />
                </View>
              </View>
            ) : null}
            <View style={styles.rowBetween}>
              <Text style={styles.taskDue}>{task.dueLabel}</Text>
              <Pressable
                style={styles.inlineButton}
                onPress={() => onStartTaskResolution(task)}
              >
                <Text style={styles.inlineButtonText}>
                  {task.type === "location" ? "Add location" : "Resolve"}
                </Text>
              </Pressable>
            </View>
          </View>
        ))}
        {tasks.length === 0 ? (
          <Text style={styles.emptyState}>
            No blockers left. This project set is clean enough to move straight into proofing.
          </Text>
        ) : null}
      </View>
    </SurfaceCard>
  );
}

function EditorTab({
  project,
  onTogglePage,
  onUpdatePageCopy,
  onThemeSelect,
  onExportProof,
}: {
  project?: Project;
  onTogglePage: (pageId: string) => void;
  onUpdatePageCopy: (
    pageId: string,
    input: { title: string; caption: string; confirmed?: boolean },
  ) => void;
  onThemeSelect: (themeId: string) => void;
  onExportProof: () => void;
}) {
  const [pageDrafts, setPageDrafts] = useState<
    Record<string, { caption: string; title: string }>
  >({});

  useEffect(() => {
    if (!project) {
      setPageDrafts({});
      return;
    }

    setPageDrafts(
      Object.fromEntries(
        project.bookDraft.pages.map((page) => [
          page.id,
          {
            title: page.title,
            caption: page.caption,
          },
        ]),
      ),
    );
  }, [project]);

  if (!project) {
    return null;
  }

  const confirmedCopyCount = project.bookDraft.pages.filter(
    (page) => page.copyStatus === "confirmed",
  ).length;
  const unconfirmedCopyCount = project.bookDraft.pages.length - confirmedCopyCount;

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

  function getDraftValue(page: Project["bookDraft"]["pages"][number]) {
    return pageDrafts[page.id] ?? {
      title: page.title,
      caption: page.caption,
    };
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

  return (
    <View style={styles.sectionStack}>
      <SurfaceCard
        title={`${project.title} layout engine`}
        subtitle="Professional proofing"
        body="The draft now sequences like a real album: opener, slower transitions, detail spreads, and a quieter close. Review the prefilled copy before export."
      >
        <View style={styles.inlineActionRow}>
          <PrimaryButton label="Export proof PDF" onPress={onExportProof} />
        </View>
        <View style={styles.editorSummaryRow}>
          <View style={styles.editorSummaryCard}>
            <Text style={styles.editorSummaryValue}>{project.bookDraft.pages.length}</Text>
            <Text style={styles.editorSummaryLabel}>Curated spreads</Text>
          </View>
          <View style={styles.editorSummaryCard}>
            <Text style={styles.editorSummaryValue}>{confirmedCopyCount}</Text>
            <Text style={styles.editorSummaryLabel}>Copy confirmed</Text>
          </View>
          <View style={styles.editorSummaryCard}>
            <Text style={styles.editorSummaryValue}>{unconfirmedCopyCount}</Text>
            <Text style={styles.editorSummaryLabel}>Needs review</Text>
          </View>
        </View>
        <View style={styles.segmentedRow}>
          {project.bookThemes.map((theme) => (
            <Pressable
              key={theme.id}
              onPress={() => onThemeSelect(theme.id)}
              style={[
                styles.themeChip,
                project.selectedThemeId === theme.id ? styles.themeChipActive : null,
              ]}
            >
              <Text style={styles.themeChipTitle}>{theme.name}</Text>
              <Text style={styles.themeChipBody}>{theme.mood}</Text>
            </Pressable>
          ))}
        </View>
      </SurfaceCard>

      <SurfaceCard
        title="Draft pages"
        subtitle="Approve or tweak"
        body="Every spread should feel professionally curated. Tighten the title, refine the caption, and explicitly confirm the copy that is ready to print."
      >
        <View style={styles.cardStack}>
          {project.bookDraft.pages.map((page, index) => {
            const pagePhotos = page.photoIds
              .map((photoId) => project.photos.find((photo) => photo.id === photoId))
              .filter((photo): photo is Project["photos"][number] => Boolean(photo));
            const draft = getDraftValue(page);

            return (
              <View key={page.id} style={styles.pageCard}>
                <View style={styles.pageCardHeader}>
                  <View style={styles.pageMetaGroup}>
                    <Text style={styles.pageEyebrow}>
                      Spread {index + 1} - {page.style.replaceAll("_", " ")}
                    </Text>
                    <View style={styles.pageTagRow}>
                      <View style={styles.pageTag}>
                        <Text style={styles.pageTagText}>
                          {getStoryBeatLabel(page)}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.pageTag,
                          (page.copyStatus ?? "prefilled") === "confirmed"
                            ? styles.pageTagConfirmed
                            : styles.pageTagPending,
                        ]}
                      >
                        <Text
                          style={[
                            styles.pageTagText,
                            (page.copyStatus ?? "prefilled") === "confirmed"
                              ? styles.pageTagTextConfirmed
                              : styles.pageTagTextPending,
                          ]}
                        >
                          {(page.copyStatus ?? "prefilled") === "confirmed"
                            ? "Copy confirmed"
                            : "Prefilled copy"}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Pressable
                    style={[
                      styles.inlineButton,
                      page.approved ? styles.inlineButtonApproved : null,
                    ]}
                    onPress={() => onTogglePage(page.id)}
                  >
                    <Text
                      style={[
                        styles.inlineButtonText,
                        page.approved ? styles.inlineButtonTextApproved : null,
                      ]}
                    >
                      {page.approved ? "Approved" : "Approve"}
                    </Text>
                  </Pressable>
                </View>
                <Field
                  label="Spread headline"
                  value={draft.title}
                  onChangeText={(value) =>
                    setPageDrafts((current) => ({
                      ...current,
                      [page.id]: {
                        ...(current[page.id] ?? {
                          title: page.title,
                          caption: page.caption,
                        }),
                        title: value,
                      },
                    }))
                  }
                />
                <Field
                  label="Spread caption"
                  value={draft.caption}
                  onChangeText={(value) =>
                    setPageDrafts((current) => ({
                      ...current,
                      [page.id]: {
                        ...(current[page.id] ?? {
                          title: page.title,
                          caption: page.caption,
                        }),
                        caption: value,
                      },
                    }))
                  }
                  multiline
                />
                <Text style={styles.pageSupportText}>{getCopySourceLabel(page)}</Text>
                {pagePhotos.length ? (
                  <View style={styles.pagePhotoStrip}>
                    {pagePhotos.map((photo) => (
                      <View key={photo.id} style={styles.pagePhotoFrame}>
                        {photo.imageUri ? (
                          <Image
                            source={{ uri: photo.imageUri }}
                            style={styles.pagePhotoThumb}
                          />
                        ) : (
                          <View style={styles.pagePhotoFallback}>
                            <Text style={styles.pagePhotoFallbackText}>
                              {photo.orientation}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.pagePhotoCaption}>{photo.title}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                <View style={styles.pageCopyActions}>
                  <PrimaryButton
                    label="Save draft copy"
                    onPress={() =>
                      onUpdatePageCopy(page.id, {
                        title: draft.title,
                        caption: draft.caption,
                      })
                    }
                    compact
                    dark
                  />
                  <PrimaryButton
                    label={page.copyStatus === "confirmed" ? "Refresh confirmed copy" : "Confirm copy"}
                    onPress={() =>
                      onUpdatePageCopy(page.id, {
                        title: draft.title,
                        caption: draft.caption,
                        confirmed: true,
                      })
                    }
                    compact
                  />
                </View>
                <Text style={styles.pageCurationNote}>
                  {page.curationNote ?? page.layoutNote}
                </Text>
                <Text style={styles.pageNote}>{page.layoutNote}</Text>
              </View>
            );
          })}
        </View>
      </SurfaceCard>
    </View>
  );
}

function PrintTab({
  project,
  onAdvancePrintOrder,
  onFinalizeProject,
  onExportProof,
}: {
  project?: Project;
  onAdvancePrintOrder: () => void;
  onFinalizeProject: () => void;
  onExportProof: () => void;
}) {
  if (!project) {
    return null;
  }

  return (
    <View style={styles.sectionStack}>
      <SurfaceCard
        title="Finalize project"
        subtitle="Gate before export"
        body="Finalization keeps the print path honest by blocking unresolved metadata instead of pretending the book is ready."
      >
        <View style={styles.inlineActionRow}>
          <PrimaryButton label="Run finalize check" onPress={onFinalizeProject} compact />
          <PrimaryButton label="Export proof PDF" onPress={onExportProof} compact dark />
        </View>
        <Text style={styles.finalizeText}>Current project status: {project.status}</Text>
      </SurfaceCard>

      <View style={styles.printCard}>
        <Text style={styles.printEyebrow}>Mock print partner</Text>
        <Text style={styles.printTitle}>{project.mockPrintOrder.orderCode}</Text>
        <Text style={styles.printBody}>
          {project.mockPrintOrder.shippingName} - {project.mockPrintOrder.shippingCity}
        </Text>
        <Text style={styles.printBody}>
          ${(project.mockPrintOrder.priceCents / 100).toFixed(2)} -{" "}
          {project.mockPrintOrder.estimatedShipWindow}
        </Text>
        <Text style={styles.printStatus}>
          Status: {project.mockPrintOrder.status}
        </Text>
        <PrimaryButton
          label="Advance mock order status"
          onPress={onAdvancePrintOrder}
          dark
        />
      </View>
    </View>
  );
}

function BookTile({
  project,
  isSelected,
  onPress,
  tall,
  compact,
}: {
  project: Project;
  isSelected?: boolean;
  onPress: () => void;
  tall?: boolean;
  compact?: boolean;
}) {
  const summary = getProjectSummary(project);
  const coverPhoto = getProjectCoverPhoto(project);
  const accent = getProjectAccent(project);
  const progress = getProjectProgress(project);

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.bookTile,
        compact ? styles.bookTileCompact : null,
        tall ? styles.bookTileTall : styles.bookTileShort,
        isSelected ? styles.bookTileSelected : null,
      ]}
    >
      {coverPhoto?.imageUri ? (
        <Image source={{ uri: coverPhoto.imageUri }} style={styles.bookTileImage} />
      ) : (
        <View style={[styles.bookTileFallback, { backgroundColor: `${accent}22` }]}>
          <Text style={[styles.bookTileFallbackText, { color: accent }]}>
            {project.type === "trip" ? "Trip edit" : "Yearbook"}
          </Text>
        </View>
      )}
      <View style={styles.bookTileScrim} />
      <View style={styles.bookTileHeader}>
        <Text style={styles.bookTileBadge}>
          {project.type === "trip"
            ? "Trip book"
            : getYearbookCycleLabel(project.yearbookCycle ?? "calendar_year")}
        </Text>
        <Text style={styles.bookTileStage}>{getProjectStageLabel(project)}</Text>
      </View>
      <View style={styles.bookTileFooter}>
        <Text style={styles.bookTileTitle}>{project.title}</Text>
        <Text style={styles.bookTileRange}>{formatProjectRange(project)}</Text>
        <View style={styles.bookTileProgressTrack}>
          <View
            style={[
              styles.bookTileProgressFill,
              { width: `${progress * 100}%`, backgroundColor: accent },
            ]}
          />
        </View>
        <Text style={styles.bookTileMeta}>
          {summary.pageCount} pages - {summary.approvedPhotos} approved - {summary.openTasks} open
          fixes
        </Text>
      </View>
    </Pressable>
  );
}

function LibraryPill({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.libraryPill}>
      <Text style={styles.libraryPillValue}>{value}</Text>
      <Text style={styles.libraryPillLabel}>{label}</Text>
    </View>
  );
}

function SurfaceCard({
  title,
  subtitle,
  body,
  children,
}: {
  title: string;
  subtitle: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.surfaceCard}>
      <Text style={styles.surfaceEyebrow}>{subtitle}</Text>
      <Text style={styles.surfaceTitle}>{title}</Text>
      <Text style={styles.surfaceBody}>{body}</Text>
      <View style={styles.surfaceChildren}>{children}</View>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  multiline,
  compact,
  editable = true,
  secureTextEntry,
  keyboardType,
  autoCapitalize = "sentences",
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  compact?: boolean;
  editable?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <View style={[styles.fieldWrap, compact ? styles.fieldWrapCompact : null]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        autoCapitalize={autoCapitalize}
        editable={editable}
        keyboardType={keyboardType}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        style={[
          styles.fieldInput,
          !editable ? styles.fieldInputReadOnly : null,
          multiline ? styles.fieldInputMultiline : null,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={palette.muted}
      />
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  compact,
  dark,
}: {
  label: string;
  onPress: () => void;
  compact?: boolean;
  dark?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.primaryButton,
        compact ? styles.primaryButtonCompact : null,
        dark ? styles.primaryButtonDark : null,
      ]}
    >
      <Text
        style={[
          styles.primaryButtonLabel,
          dark ? styles.primaryButtonLabelDark : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  appShell: {
    flex: 1,
  },
  authLoadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 10,
  },
  authLoadingTitle: {
    fontSize: 24,
    lineHeight: 28,
    color: palette.ink,
    fontWeight: "700",
  },
  authLoadingBody: {
    maxWidth: 320,
    fontSize: 14,
    lineHeight: 23,
    textAlign: "center",
    color: palette.muted,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 120,
    gap: 18,
  },
  heroCard: {
    backgroundColor: palette.card,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 22,
    shadowColor: "#5c4032",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 16 },
    shadowRadius: 34,
    elevation: 4,
  },
  heroHeaderRow: {
    gap: 16,
  },
  heroCopy: {
    gap: 8,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: palette.muted,
    fontWeight: "700",
  },
  heroTitle: {
    fontSize: 38,
    lineHeight: 40,
    color: palette.ink,
    fontWeight: "700",
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 25,
    color: "#564b44",
  },
  syncSummary: {
    fontSize: 13,
    lineHeight: 22,
    color: palette.forest,
    fontWeight: "600",
  },
  heroProjectCard: {
    minHeight: 210,
    borderRadius: 26,
    overflow: "hidden",
    backgroundColor: "#ddcfbf",
    position: "relative",
  },
  heroProjectImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  heroProjectPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.accentSoft,
  },
  heroProjectPlaceholderText: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 2.2,
    color: palette.accent,
    fontWeight: "700",
  },
  heroProjectOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 11, 8, 0.28)",
  },
  heroProjectMeta: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
    gap: 4,
  },
  heroProjectEyebrow: {
    color: "#f2ded0",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.9,
    fontWeight: "700",
  },
  heroProjectTitle: {
    fontSize: 24,
    lineHeight: 26,
    color: "#fff7f0",
    fontWeight: "700",
  },
  heroProjectRange: {
    fontSize: 13,
    color: "#f3e5d9",
    fontWeight: "600",
  },
  heroStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18,
  },
  statCard: {
    width: "48%",
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: palette.ink,
  },
  statLabel: {
    marginTop: 6,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    color: palette.muted,
  },
  bottomDock: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255, 249, 243, 0.95)",
    borderWidth: 1,
    borderColor: palette.line,
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 16,
    shadowColor: "#271b14",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 6,
  },
  dockButton: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  dockButtonActive: {
    backgroundColor: palette.ink,
  },
  dockButtonText: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.4,
    color: palette.ink,
  },
  dockButtonTextActive: {
    color: "#fbf3ea",
  },
  sectionStack: {
    gap: 18,
  },
  surfaceCard: {
    backgroundColor: palette.card,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 20,
    gap: 10,
  },
  surfaceEyebrow: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: palette.muted,
    fontWeight: "700",
  },
  surfaceTitle: {
    fontSize: 28,
    lineHeight: 30,
    fontWeight: "700",
    color: palette.ink,
  },
  surfaceBody: {
    fontSize: 14,
    lineHeight: 24,
    color: "#5d524a",
  },
  surfaceChildren: {
    gap: 12,
    marginTop: 6,
  },
  segmentedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  segmentChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  segmentChipActive: {
    backgroundColor: palette.accentSoft,
    borderColor: "rgba(195,109,63,0.35)",
  },
  segmentChipText: {
    color: palette.ink,
    textTransform: "capitalize",
    fontWeight: "700",
  },
  segmentChipTextActive: {
    color: palette.accent,
  },
  fieldWrap: {
    gap: 6,
  },
  fieldWrapCompact: {
    flex: 1,
  },
  helperText: {
    fontSize: 13,
    lineHeight: 22,
    color: palette.forest,
    fontWeight: "600",
  },
  authErrorText: {
    fontSize: 13,
    lineHeight: 22,
    color: "#983d16",
    fontWeight: "600",
  },
  accountCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.78)",
    padding: 14,
    gap: 10,
  },
  accountCardCopy: {
    gap: 4,
  },
  accountCardEyebrow: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    color: palette.muted,
    fontWeight: "700",
  },
  accountCardTitle: {
    fontSize: 20,
    lineHeight: 22,
    color: palette.ink,
    fontWeight: "700",
  },
  accountCardBody: {
    fontSize: 14,
    lineHeight: 22,
    color: "#5d524a",
  },
  fieldLabel: {
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: palette.muted,
    fontWeight: "700",
  },
  fieldInput: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.78)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: palette.ink,
    fontSize: 15,
  },
  fieldInputReadOnly: {
    backgroundColor: "rgba(239, 232, 225, 0.78)",
    color: palette.muted,
  },
  fieldInputMultiline: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  inlineFields: {
    flexDirection: "row",
    gap: 10,
  },
  inlineActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  primaryButton: {
    backgroundColor: palette.accent,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonCompact: {
    paddingVertical: 12,
  },
  primaryButtonDark: {
    backgroundColor: palette.ink,
  },
  primaryButtonLabel: {
    color: "#fff8f2",
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  primaryButtonLabelDark: {
    color: "#f8f0e8",
  },
  cardStack: {
    gap: 12,
  },
  libraryPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  libraryPill: {
    width: "31%",
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 3,
  },
  libraryPillValue: {
    fontSize: 22,
    lineHeight: 24,
    color: palette.ink,
    fontWeight: "700",
  },
  libraryPillLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    color: palette.muted,
    fontWeight: "700",
  },
  featuredWorkspace: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.76)",
    padding: 16,
    gap: 14,
  },
  featuredWorkspaceCopy: {
    gap: 6,
  },
  featuredWorkspaceEyebrow: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.8,
    color: palette.accent,
    fontWeight: "700",
  },
  featuredWorkspaceTitle: {
    fontSize: 24,
    lineHeight: 26,
    color: palette.ink,
    fontWeight: "700",
  },
  featuredWorkspaceBody: {
    fontSize: 14,
    lineHeight: 23,
    color: "#5d524a",
  },
  featuredWorkspaceMeta: {
    fontSize: 13,
    lineHeight: 20,
    color: palette.forest,
    fontWeight: "600",
  },
  featuredWorkspaceActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  galleryHeader: {
    gap: 8,
  },
  galleryHeaderCopy: {
    gap: 4,
  },
  galleryTitle: {
    fontSize: 18,
    lineHeight: 22,
    color: palette.ink,
    fontWeight: "700",
  },
  galleryBody: {
    fontSize: 13,
    lineHeight: 22,
    color: palette.muted,
  },
  galleryCount: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    color: palette.forest,
    fontWeight: "700",
  },
  boardColumns: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  boardColumn: {
    flex: 1,
    gap: 12,
  },
  bookTile: {
    borderRadius: 28,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#e4d5c5",
    borderWidth: 1,
    borderColor: "rgba(31, 24, 20, 0.08)",
  },
  bookTileSelected: {
    borderColor: "rgba(195,109,63,0.45)",
    shadowColor: "#5c4032",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 4,
  },
  bookTileTall: {
    minHeight: 250,
  },
  bookTileShort: {
    minHeight: 210,
  },
  bookTileCompact: {
    minHeight: 188,
    flex: 1,
  },
  bookTileImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  bookTileFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  bookTileFallbackText: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 2,
    fontWeight: "700",
  },
  bookTileScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(18, 12, 9, 0.24)",
  },
  bookTileHeader: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    gap: 4,
  },
  bookTileBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
    color: "#fff8f2",
    fontSize: 10,
    letterSpacing: 1.7,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  bookTileStage: {
    fontSize: 11,
    lineHeight: 16,
    color: "#f4e5d8",
    fontWeight: "600",
  },
  bookTileFooter: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
    gap: 6,
  },
  bookTileTitle: {
    fontSize: 22,
    lineHeight: 24,
    color: "#fffaf5",
    fontWeight: "700",
  },
  bookTileRange: {
    fontSize: 12,
    lineHeight: 18,
    color: "#f1dfd2",
    fontWeight: "600",
  },
  bookTileProgressTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.26)",
    overflow: "hidden",
  },
  bookTileProgressFill: {
    height: "100%",
    borderRadius: 999,
  },
  bookTileMeta: {
    fontSize: 12,
    lineHeight: 18,
    color: "#f4e6da",
  },
  archiveShelf: {
    gap: 10,
  },
  archiveShelfTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.8,
    color: palette.muted,
    fontWeight: "700",
  },
  archiveRow: {
    flexDirection: "row",
    gap: 12,
  },
  archiveHint: {
    fontSize: 13,
    lineHeight: 22,
    color: palette.muted,
  },
  projectCard: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.72)",
    padding: 16,
    gap: 8,
  },
  projectCardActive: {
    borderColor: "rgba(195,109,63,0.5)",
    backgroundColor: "#fff7f0",
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  projectCardEyebrow: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.7,
    color: palette.muted,
    fontWeight: "700",
  },
  projectCardStatus: {
    fontSize: 12,
    color: palette.accent,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  projectCardTitle: {
    fontSize: 22,
    lineHeight: 24,
    color: palette.ink,
    fontWeight: "700",
  },
  projectCardBody: {
    fontSize: 14,
    lineHeight: 24,
    color: "#5d524a",
  },
  projectCardRange: {
    fontSize: 13,
    color: palette.forest,
    fontWeight: "700",
  },
  projectCardMetrics: {
    fontSize: 13,
    color: palette.muted,
  },
  memberGrid: {
    gap: 10,
  },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.74)",
    padding: 12,
  },
  memberInitial: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: "hidden",
    backgroundColor: palette.ink,
    textAlign: "center",
    lineHeight: 38,
    color: "#fff9f2",
    fontWeight: "700",
  },
  memberMeta: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.ink,
  },
  memberEmail: {
    marginTop: 2,
    fontSize: 13,
    color: palette.muted,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  photoCard: {
    width: "48%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.78)",
    padding: 10,
    gap: 8,
  },
  photoThumb: {
    width: "100%",
    height: 132,
    borderRadius: 14,
    backgroundColor: "#e7ddd2",
  },
  photoPlaceholder: {
    height: 132,
    borderRadius: 14,
    backgroundColor: palette.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  photoPlaceholderText: {
    textTransform: "uppercase",
    letterSpacing: 2,
    color: palette.accent,
    fontWeight: "700",
    fontSize: 11,
  },
  photoTitle: {
    fontSize: 15,
    lineHeight: 18,
    color: palette.ink,
    fontWeight: "700",
  },
  photoMeta: {
    fontSize: 12,
    lineHeight: 18,
    color: palette.muted,
  },
  taskCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.74)",
    padding: 16,
    gap: 8,
  },
  taskEyebrow: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.7,
    color: palette.accent,
    fontWeight: "700",
  },
  taskTitle: {
    fontSize: 20,
    lineHeight: 23,
    color: palette.ink,
    fontWeight: "700",
  },
  taskBody: {
    fontSize: 14,
    lineHeight: 24,
    color: "#5d524a",
  },
  taskResolutionEditor: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingTop: 12,
    marginTop: 4,
  },
  taskDue: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    color: palette.muted,
    fontWeight: "700",
  },
  inlineButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(195,109,63,0.28)",
    backgroundColor: palette.accentSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inlineButtonApproved: {
    backgroundColor: palette.forestSoft,
    borderColor: "rgba(46,92,77,0.28)",
  },
  inlineButtonText: {
    color: palette.accent,
    fontWeight: "700",
    fontSize: 13,
  },
  inlineButtonTextApproved: {
    color: palette.forest,
  },
  emptyState: {
    fontSize: 14,
    lineHeight: 24,
    color: palette.muted,
  },
  themeChip: {
    flexBasis: "48%",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.72)",
    padding: 14,
    gap: 4,
  },
  themeChipActive: {
    backgroundColor: "#fff6ef",
    borderColor: "rgba(195,109,63,0.32)",
  },
  themeChipTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: palette.ink,
  },
  themeChipBody: {
    fontSize: 13,
    lineHeight: 20,
    color: palette.muted,
  },
  editorSummaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  editorSummaryCard: {
    flex: 1,
    minWidth: 96,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.76)",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 3,
  },
  editorSummaryValue: {
    fontSize: 24,
    lineHeight: 26,
    color: palette.ink,
    fontWeight: "700",
  },
  editorSummaryLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    color: palette.muted,
    fontWeight: "700",
  },
  pageCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.82)",
    padding: 16,
    gap: 10,
  },
  pageCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  pageMetaGroup: {
    flex: 1,
    gap: 6,
  },
  pageEyebrow: {
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: palette.muted,
    fontWeight: "700",
  },
  pageTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pageTag: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(31,24,20,0.06)",
  },
  pageTagConfirmed: {
    backgroundColor: palette.forestSoft,
  },
  pageTagPending: {
    backgroundColor: palette.accentSoft,
  },
  pageTagText: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    color: palette.muted,
    fontWeight: "700",
  },
  pageTagTextConfirmed: {
    color: palette.forest,
  },
  pageTagTextPending: {
    color: palette.accent,
  },
  pageTitle: {
    fontSize: 24,
    lineHeight: 28,
    color: palette.ink,
    fontWeight: "700",
  },
  pageBody: {
    fontSize: 14,
    lineHeight: 24,
    color: "#5d524a",
  },
  pagePhotoStrip: {
    flexDirection: "row",
    gap: 10,
  },
  pagePhotoFrame: {
    flex: 1,
    gap: 6,
  },
  pagePhotoThumb: {
    width: "100%",
    height: 148,
    borderRadius: 18,
    backgroundColor: "#e7ddd2",
  },
  pagePhotoFallback: {
    height: 148,
    borderRadius: 18,
    backgroundColor: palette.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  pagePhotoFallbackText: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.8,
    color: palette.accent,
    fontWeight: "700",
  },
  pagePhotoCaption: {
    fontSize: 12,
    lineHeight: 18,
    color: palette.muted,
    fontWeight: "600",
  },
  pageSupportText: {
    fontSize: 12,
    lineHeight: 19,
    color: palette.muted,
    fontWeight: "600",
  },
  pageCopyActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  pageCurationNote: {
    fontSize: 13,
    lineHeight: 21,
    color: palette.ink,
    fontWeight: "600",
  },
  pageNote: {
    fontSize: 13,
    lineHeight: 22,
    color: palette.forest,
    fontWeight: "600",
  },
  finalizeText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 24,
    color: "#5d524a",
  },
  printCard: {
    backgroundColor: palette.ink,
    borderRadius: 28,
    padding: 22,
    gap: 10,
  },
  printEyebrow: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#dbc4b3",
    fontWeight: "700",
  },
  printTitle: {
    fontSize: 30,
    lineHeight: 32,
    color: "#fff7ef",
    fontWeight: "700",
  },
  printBody: {
    fontSize: 15,
    lineHeight: 24,
    color: "#f0e2d6",
  },
  printStatus: {
    fontSize: 14,
    color: "#d6baa7",
    fontWeight: "700",
    marginBottom: 4,
  },
});

