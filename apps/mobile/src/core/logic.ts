import { createMockProject, createSeedProjects, getProjectSummary } from "./mock-data";
import type {
  AddLocalPhotoInput,
  AddProjectNoteInput,
  BookPage,
  CreateProjectInput,
  PhotoAsset,
  Project,
  ProjectNote,
  ResolutionTaskStatus,
  YearbookCycle,
} from "./types";

export { createMockProject, createSeedProjects, getProjectSummary };

function parseDateOnlyForDisplay(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function findProjectById(projects: Project[], projectId: string) {
  return projects.find((project) => project.id === projectId);
}

export function formatProjectRange(project: Project) {
  if (project.type === "yearbook") {
    if (project.yearbookCycle === "calendar_year" && project.year) {
      return `${project.year} calendar year`;
    }

    if (
      project.yearbookCycle &&
      project.yearbookCycle !== "calendar_year" &&
      project.anniversaryDate
    ) {
      const options: Intl.DateTimeFormatOptions = {
        month: "short",
        day: "numeric",
        timeZone: project.timezone,
      };
      const start = parseDateOnlyForDisplay(project.startDate).toLocaleDateString(
        "en-US",
        options,
      );
      const end = parseDateOnlyForDisplay(project.endDate).toLocaleDateString(
        "en-US",
        options,
      );
      return `${getYearbookCycleLabel(project.yearbookCycle)} - ${start} to ${end}`;
    }
  }

  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    timeZone: project.timezone,
  };

  const start = parseDateOnlyForDisplay(project.startDate).toLocaleDateString(
    "en-US",
    options,
  );
  const end = parseDateOnlyForDisplay(project.endDate).toLocaleDateString(
    "en-US",
    options,
  );

  return `${start} - ${end}`;
}

export function getYearbookCycleLabel(cycle: YearbookCycle) {
  switch (cycle) {
    case "calendar_year":
      return "Calendar year";
    case "dating_anniversary":
      return "Dating anniversary year";
    case "wedding_anniversary":
      return "Wedding anniversary year";
    default:
      return cycle;
  }
}

export function buildCalendarYearRange(year: number) {
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
}

export function buildAnniversaryYearEndDate(startDate: string) {
  const [year, month, day] = startDate.split("-").map(Number);
  const endDate = new Date(Date.UTC(year + 1, month - 1, day));
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  return endDate.toISOString().slice(0, 10);
}

export function listOpenTasks(projects: Project[]) {
  return projects.flatMap((project) =>
    project.resolutionTasks
      .filter((task) => task.status !== "resolved")
      .map((task) => ({
        projectId: project.id,
        projectTitle: project.title,
        ...task,
      })),
  );
}

export function addCollaborator(
  project: Project,
  input: { name: string; email: string },
): Project {
  const id = input.email.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return {
    ...project,
    members: [
      ...project.members,
      {
        id,
        name: input.name,
        email: input.email,
        role: "collaborator",
        avatarLabel: input.name.slice(0, 1).toUpperCase(),
        homeBase: "Invite pending",
      },
    ],
    invites: [
      ...project.invites,
      {
        id: `invite-${id}`,
        email: input.email,
        role: "collaborator",
        status: "sent",
        sentAt: new Date().toISOString(),
      },
    ],
  };
}

export function updateTaskStatus(
  project: Project,
  taskId: string,
  status: ResolutionTaskStatus,
): Project {
  const resolutionTasks = project.resolutionTasks.map((task) =>
    task.id === taskId ? { ...task, status } : task,
  );

  const hasOpenTasks = resolutionTasks.some((task) => task.status !== "resolved");

  return {
    ...project,
    status: hasOpenTasks ? "needs_resolution" : "reviewing",
    resolutionTasks,
  } satisfies Project;
}

function getPhotoIdForTask(taskId: string) {
  if (!taskId.startsWith("task-")) {
    return null;
  }

  return taskId.slice(5);
}

export function resolveProjectTask(
  project: Project,
  taskId: string,
  input?: { locationLabel?: string },
): Project {
  const task = project.resolutionTasks.find((entry) => entry.id === taskId);
  if (!task) {
    return project;
  }

  let nextPhotos = project.photos;

  if (task.type === "location") {
    const photoId = getPhotoIdForTask(taskId);
    const trimmedLocation = input?.locationLabel?.trim();

    nextPhotos = project.photos.map((photo) => {
      if (photo.id !== photoId) {
        return photo;
      }

      if (!trimmedLocation) {
        return photo;
      }

      const qualityNotes = photo.qualityNotes.includes(
        "Location confirmed manually in the app.",
      )
        ? photo.qualityNotes
        : [...photo.qualityNotes, "Location confirmed manually in the app."];

      return {
        ...photo,
        locationLabel: trimmedLocation,
        locationConfidence: photo.locationConfidence === "exact" ? "exact" : "inferred",
        qualityNotes,
      };
    });
  }

  const resolutionTasks = project.resolutionTasks.map((entry) =>
    entry.id === taskId
      ? {
          ...entry,
          status: "resolved" as const,
          detail:
            task.type === "location" && input?.locationLabel?.trim()
              ? `Location confirmed as ${input.locationLabel.trim()}.`
              : entry.detail,
        }
      : entry,
  );

  const hasOpenTasks = resolutionTasks.some((entry) => entry.status !== "resolved");

  return regenerateBookDraft({
    ...project,
    status: hasOpenTasks ? "needs_resolution" : "reviewing",
    photos: nextPhotos,
    resolutionTasks,
  });
}

export function togglePageApproval(project: Project, pageId: string): Project {
  return {
    ...project,
    bookDraft: {
      ...project.bookDraft,
      pages: project.bookDraft.pages.map((page) =>
        page.id === pageId ? { ...page, approved: !page.approved } : page,
      ),
    },
  } satisfies Project;
}

export function cyclePrintOrder(project: Project): Project {
  const nextStatus: Project["mockPrintOrder"]["status"] =
    project.mockPrintOrder.status === "draft"
      ? "reviewing"
      : project.mockPrintOrder.status === "reviewing"
        ? "queued"
        : project.mockPrintOrder.status === "queued"
          ? "confirmed"
          : "confirmed";

  return {
    ...project,
    mockPrintOrder: {
      ...project.mockPrintOrder,
      status: nextStatus,
    },
  } satisfies Project;
}

export function finalizeProject(project: Project): Project {
  const hasOpenTasks = project.resolutionTasks.some((task) => task.status !== "resolved");

  return {
    ...project,
    status: hasOpenTasks ? "needs_resolution" : "ready_to_print",
  } satisfies Project;
}

export function seedAndCreateProject(input: CreateProjectInput) {
  const projects = createSeedProjects();
  return [createMockProject(input), ...projects];
}

export function addNoteToProject(
  project: Project,
  input: AddProjectNoteInput,
): Project {
  const note: ProjectNote = {
    id: `note-${Date.now()}`,
    authorId: input.authorId,
    title: input.title,
    body: input.body,
    createdAt: new Date().toISOString(),
  };

  return regenerateBookDraft({
    ...project,
    notes: [note, ...project.notes],
  });
}

export function addPhotosToProject(
  project: Project,
  photos: AddLocalPhotoInput[],
): Project {
  const nextPhotos = photos.map<PhotoAsset>((asset, index) => {
    const capturedAt = asset.capturedAt ?? new Date().toISOString();
    const orientation =
      asset.width === asset.height
        ? "square"
        : asset.width > asset.height
          ? "landscape"
          : "portrait";

    return {
      id: `photo-local-${Date.now()}-${index}`,
      title: asset.title,
      uploaderId: asset.uploaderId,
      imageUri: asset.uri,
      storagePath: asset.storagePath,
      mimeType: asset.mimeType,
      capturedAt,
      locationLabel: asset.locationLabel,
      locationConfidence: asset.locationConfidence ?? "missing",
      orientation,
      mustInclude: false,
      approved: true,
      peopleIds: [],
      faceClusterIds: [],
      qualityNotes: asset.qualityNotes?.length
        ? asset.qualityNotes
        : [
            "Imported from device library.",
            asset.locationLabel
              ? "GPS metadata was detected during import."
              : "Waiting on location inference or manual confirmation.",
          ],
      versions: [
        {
          id: `preview-${Date.now()}-${index}`,
          label: "preview",
          status: "ready",
          width: asset.width,
          height: asset.height,
        },
        {
          id: `original-${Date.now()}-${index}`,
          label: "original",
          status: "ready",
          width: asset.width,
          height: asset.height,
        },
      ],
    };
  });

  const resolutionTasks = [
    ...project.resolutionTasks,
    ...nextPhotos
      .filter((photo) => photo.locationConfidence === "missing" || !photo.locationLabel)
      .map((photo) => ({
        id: `task-${photo.id}`,
        type: "location" as const,
        title: `Confirm location for ${photo.title}`,
        detail:
          "This imported photo does not have a confirmed GPS point yet, so the export should stay blocked until someone resolves it.",
        status: "open" as const,
        dueLabel: "Before export",
        assigneeIds: project.members.map((member) => member.id),
      })),
  ];

  return regenerateBookDraft({
    ...project,
    status: resolutionTasks.some((task) => task.status !== "resolved")
      ? "needs_resolution"
      : project.status,
    photos: [...nextPhotos, ...project.photos].sort((a, b) =>
      a.capturedAt.localeCompare(b.capturedAt),
    ),
    resolutionTasks,
  });
}

export function toggleMustIncludePhoto(project: Project, photoId: string): Project {
  return regenerateBookDraft({
    ...project,
    photos: project.photos.map((photo) =>
      photo.id === photoId ? { ...photo, mustInclude: !photo.mustInclude } : photo,
    ),
  });
}

export function regenerateBookDraft(project: Project): Project {
  const orderedPhotos = [...project.photos]
    .filter((photo) => photo.approved)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

  if (orderedPhotos.length === 0) {
    return {
      ...project,
      bookDraft: {
        ...project.bookDraft,
        pages: [],
        summary:
          "Add approved photos or journal notes to generate the first polished proof.",
      },
    };
  }

  const mustInclude = orderedPhotos.filter((photo) => photo.mustInclude);
  const leadPhoto = mustInclude[0] ?? orderedPhotos[0];
  const remainingPhotos = orderedPhotos.filter((photo) => photo.id !== leadPhoto.id);
  const recapNote = project.notes[0];
  const pages: BookPage[] = [
    {
      id: `generated-hero-${leadPhoto.id}`,
      style: "hero" as const,
      title: leadPhoto.title,
      caption:
        recapNote?.body ??
        "Start the book with the strongest emotional frame and give it enough room to breathe.",
      photoIds: [leadPhoto.id],
      layoutNote:
        "Hero opener with restrained typography, generous margin, and a confident full-page crop.",
      approved: true,
    },
  ];

  for (let index = 0; index < remainingPhotos.length; index += 2) {
    const chunk = remainingPhotos.slice(index, index + 2);
    const hasLandscape = chunk.some((photo) => photo.orientation === "landscape");

    pages.push({
      id: `generated-${index}`,
      style: hasLandscape ? "balanced" : "collage",
      title: chunk.map((photo) => photo.title).join(" + "),
      caption:
        chunk.length > 1
          ? "Pair the moments tightly so the spread feels intentional instead of overcrowded."
          : "Use this image as a breathing point between denser story beats.",
      photoIds: chunk.map((photo) => photo.id),
      layoutNote: hasLandscape
        ? "Balanced spread with measured gutters and no awkward face crops."
        : "Collage spread with asymmetrical whitespace and clear hierarchy.",
      approved: false,
    });
  }

  if (recapNote) {
    pages.push({
      id: "generated-recap",
      style: "recap",
      title: recapNote.title,
      caption: recapNote.body,
      photoIds: orderedPhotos.slice(-2).map((photo) => photo.id),
      layoutNote:
        "Recap page with quieter pacing, text-led hierarchy, and the final photo pair tucked low.",
      approved: false,
    });
  }

  return {
    ...project,
    bookDraft: {
      ...project.bookDraft,
      status: "reviewing",
      pages,
      summary: `Auto-generated ${pages.length}-page proof from ${orderedPhotos.length} approved photos.`,
    },
  };
}
