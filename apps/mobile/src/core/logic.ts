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

function normalizeCopy(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function truncateCopy(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function sentenceCase(value: string) {
  const trimmed = normalizeCopy(value);
  if (!trimmed) {
    return "";
  }

  return `${trimmed.slice(0, 1).toUpperCase()}${trimmed.slice(1)}`;
}

function firstSentence(value: string) {
  const trimmed = normalizeCopy(value);
  if (!trimmed) {
    return "";
  }

  const match = trimmed.match(/^(.+?[.!?])(?:\s|$)/);
  return match?.[1] ?? trimmed;
}

function formatCaptureLabel(project: Project, capturedAt: string, options?: Intl.DateTimeFormatOptions) {
  return new Date(capturedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: project.timezone,
    ...options,
  });
}

function getTimeOfDay(capturedAt: string) {
  const hour = new Date(capturedAt).getUTCHours();

  if (hour < 11) {
    return "morning";
  }

  if (hour < 15) {
    return "midday";
  }

  if (hour < 19) {
    return "late afternoon";
  }

  return "evening";
}

function getPrimaryLocation(photos: PhotoAsset[]) {
  const rankedLocations = photos
    .map((photo) => photo.locationLabel?.trim())
    .filter((location): location is string => Boolean(location))
    .sort((left, right) => left.length - right.length);

  return rankedLocations[0] ?? null;
}

function getPeopleLabel(project: Project, photos: PhotoAsset[]) {
  const memberNames = [...new Set(
    photos.flatMap((photo) =>
      photo.peopleIds
        .map((personId) => project.members.find((member) => member.id === personId)?.name)
        .filter((name): name is string => Boolean(name)),
    ),
  )];

  if (memberNames.length === 0) {
    return "the two of you";
  }

  if (memberNames.length === 1) {
    return memberNames[0];
  }

  if (memberNames.length === 2) {
    return `${memberNames[0]} and ${memberNames[1]}`;
  }

  return `${memberNames[0]}, ${memberNames[1]}, and friends`;
}

function getLeadPhotoScore(photo: PhotoAsset) {
  return (
    (photo.mustInclude ? 40 : 0) +
    (photo.orientation === "landscape" ? 10 : photo.orientation === "portrait" ? 7 : 8) +
    (photo.locationConfidence === "exact" ? 6 : photo.locationConfidence === "inferred" ? 3 : 0) +
    photo.peopleIds.length * 3 +
    Math.min(photo.qualityNotes.length, 4)
  );
}

function chooseLeadPhoto(photos: PhotoAsset[]) {
  return [...photos].sort((left, right) => {
    const scoreDelta = getLeadPhotoScore(right) - getLeadPhotoScore(left);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return left.capturedAt.localeCompare(right.capturedAt);
  })[0];
}

function createPageId(storyBeat: BookPage["storyBeat"], photoIds: string[]) {
  const photoKey = photoIds.length ? photoIds.join("-") : "text";
  return `page-${storyBeat}-${photoKey}`;
}

function createPageSignature(page: Pick<BookPage, "storyBeat" | "photoIds">) {
  const photoKey = [...page.photoIds].sort().join("|") || "text";
  return `${page.storyBeat}:${photoKey}`;
}

function chooseSpreadStyle(photos: PhotoAsset[], chunkIndex: number): BookPage["style"] {
  if (photos.length === 1) {
    return photos[0].orientation === "landscape" ? "full_bleed" : "balanced";
  }

  if (photos.length === 2) {
    return photos[0].orientation === photos[1].orientation ? "diptych" : "balanced";
  }

  return chunkIndex % 2 === 0 ? "mosaic" : "collage";
}

function chooseChunkSize(photos: PhotoAsset[], startIndex: number) {
  const remaining = photos.length - startIndex;

  if (remaining <= 2) {
    return remaining;
  }

  const current = photos[startIndex];
  const next = photos[startIndex + 1];
  const third = photos[startIndex + 2];

  if (current.mustInclude && current.orientation === "landscape") {
    return 1;
  }

  if (
    current.orientation !== "landscape" &&
    next.orientation !== "landscape" &&
    third &&
    third.orientation !== "landscape"
  ) {
    return 3;
  }

  return 2;
}

function describePhotoMoment(project: Project, photos: PhotoAsset[]) {
  const leadPhoto = photos[0];
  const location = getPrimaryLocation(photos);
  const timeOfDay = getTimeOfDay(leadPhoto.capturedAt);
  const people = getPeopleLabel(project, photos);
  const dateLabel = formatCaptureLabel(project, leadPhoto.capturedAt);

  return {
    dateLabel,
    location,
    people,
    timeOfDay,
  };
}

function buildOpenerPage(project: Project, photo: PhotoAsset, note?: ProjectNote): BookPage {
  const moment = describePhotoMoment(project, [photo]);
  const noteSentence = note ? firstSentence(note.body) : "";
  const title =
    note?.title?.trim() ||
    (moment.location
      ? `${moment.location} settled in immediately`
      : `${sentenceCase(moment.timeOfDay)} started the trip strong`);
  const caption = noteSentence
    ? truncateCopy(noteSentence, 220)
    : truncateCopy(
        `${sentenceCase(moment.timeOfDay)} at ${moment.location ?? project.title}. Lead with this frame so the book opens with calm confidence instead of a busy montage.`,
        220,
      );

  return {
    id: createPageId("opener", [photo.id]),
    style: photo.orientation === "landscape" ? "full_bleed" : "hero",
    storyBeat: "opener",
    title,
    caption,
    copyStatus: "prefilled",
    copySource: note ? "hybrid" : "metadata",
    photoIds: [photo.id],
    layoutNote:
      "Open with a generous image field, minimal copy, and enough negative space to make the first page feel expensive.",
    curationNote:
      "This is the emotional cover spread inside the book, so the strongest frame gets room to breathe before the denser sequences arrive.",
    approved: false,
  };
}

function buildChapterPage(project: Project, photo: PhotoAsset | undefined, note: ProjectNote): BookPage {
  const moment = photo ? describePhotoMoment(project, [photo]) : null;
  const title = note.title.trim() || (moment?.location ? `${moment.location} journal` : "Story break");
  const caption = truncateCopy(
    note.body.trim() ||
      "Use a quieter text-led spread to slow the pace and frame the next run of photographs.",
    260,
  );
  const photoIds = photo ? [photo.id] : [];

  return {
    id: createPageId("scene_setter", photoIds),
    style: "chapter",
    storyBeat: "scene_setter",
    title,
    caption,
    copyStatus: "prefilled",
    copySource: photo ? "hybrid" : "note",
    photoIds,
    layoutNote:
      "Treat this as a chapter break: one supporting image at most, elegant copy width, and quiet pacing before the next image-heavy spread.",
    curationNote:
      "A note-driven interlude keeps the book from feeling like a timeline dump and gives the narrative a human voice.",
    approved: false,
  };
}

function buildStoryPage(
  project: Project,
  photos: PhotoAsset[],
  index: number,
): BookPage {
  const moment = describePhotoMoment(project, photos);
  const style = chooseSpreadStyle(photos, index);
  const dominantTitle = photos[0]?.title ?? project.title;
  const locationLead = moment.location ?? moment.dateLabel;
  const peopleLead = moment.people;
  const title =
    photos.length === 1
      ? `${locationLead} deserved its own page`
      : photos.length === 2
        ? `${locationLead} in two beats`
        : `${locationLead} in smaller details`;
  const caption =
    photos.length === 1
      ? truncateCopy(
          `${sentenceCase(moment.timeOfDay)} light and ${dominantTitle.toLowerCase()} make this the kind of frame that should stand on its own, with only a restrained caption below it.`,
          230,
        )
      : photos.length === 2
        ? truncateCopy(
            `Keep these images together so the spread moves from scene to detail. ${peopleLead} stay present without forcing the page to feel crowded.`,
            230,
          )
        : truncateCopy(
            `Use this sequence to collect the smaller memories around ${locationLead}: textures, reactions, and in-between moments that make the trip feel lived in rather than staged.`,
            240,
          );

  return {
    id: createPageId(
      photos.length === 1 ? "highlight" : photos.length === 2 ? "details" : "reflection",
      photos.map((photo) => photo.id),
    ),
    style,
    storyBeat: photos.length === 1 ? "highlight" : photos.length === 2 ? "details" : "reflection",
    title,
    caption,
    copyStatus: "prefilled",
    copySource: "metadata",
    photoIds: photos.map((photo) => photo.id),
    layoutNote:
      style === "full_bleed"
        ? "Let the image run large with a quiet caption block so the spread feels cinematic rather than busy."
        : style === "diptych"
          ? "Keep both frames equal enough to feel intentional, then anchor the copy in a slim column."
          : style === "mosaic"
            ? "Use one lead image and smaller supporting moments so the spread reads curated instead of scrapbooked."
            : "Balance hierarchy, copy, and white space so each spread has a clear lead image.",
    curationNote:
      photos.length === 1
        ? "Single-image spreads are reserved for the frames that can carry a whole beat by themselves."
        : photos.length === 2
          ? "Pairings should feel like an editor matched a hero moment with its supporting detail."
          : "Dense spreads should collect detail without sacrificing calm margins or hierarchy.",
    approved: false,
  };
}

function buildClosingPage(project: Project, photos: PhotoAsset[], note?: ProjectNote): BookPage {
  const moment = describePhotoMoment(project, photos);
  const noteSentence = note ? firstSentence(note.body) : "";
  const title =
    note?.title?.trim() ||
    (moment.location
      ? `Leaving ${moment.location} on the right note`
      : "The trip ends softer than it started");
  const caption = truncateCopy(
    noteSentence ||
      `Close on the quieter moments. The book should finish with warmth and memory, not with the busiest collage in the stack.`,
    220,
  );

  return {
    id: createPageId("closing", photos.map((photo) => photo.id)),
    style: photos.length === 1 ? "closing" : "recap",
    storyBeat: "closing",
    title,
    caption,
    copyStatus: "prefilled",
    copySource: note ? "hybrid" : "metadata",
    photoIds: photos.map((photo) => photo.id),
    layoutNote:
      "End with a lower-energy spread, restrained copy, and a final image grouping that feels conclusive rather than abrupt.",
    curationNote:
      "The last spread should feel like the final beat of a well-edited album, with a little more air and a little less density.",
    approved: false,
  };
}

function preserveExistingEditorialChoices(project: Project, generatedPage: BookPage): BookPage {
  const existing = project.bookDraft.pages.find(
    (page) => createPageSignature(page) === createPageSignature(generatedPage),
  );

  if (!existing) {
    return generatedPage;
  }

  const preserveCopy =
    existing.copySource === "manual" || existing.copyStatus === "confirmed";

  return {
    ...generatedPage,
    id: existing.id || generatedPage.id,
    title: preserveCopy ? existing.title : generatedPage.title,
    caption: preserveCopy ? existing.caption : generatedPage.caption,
    copyStatus: preserveCopy ? existing.copyStatus : generatedPage.copyStatus,
    copySource: preserveCopy ? existing.copySource : generatedPage.copySource,
    approved: existing.approved,
  };
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

export function updateBookPageCopy(
  project: Project,
  pageId: string,
  input: { title?: string; caption?: string; confirmed?: boolean },
): Project {
  return {
    ...project,
    bookDraft: {
      ...project.bookDraft,
      pages: project.bookDraft.pages.map((page) => {
        if (page.id !== pageId) {
          return page;
        }

        const nextTitle = normalizeCopy(input.title ?? page.title) || page.title;
        const nextCaption = normalizeCopy(input.caption ?? page.caption) || page.caption;
        const didEdit = nextTitle !== page.title || nextCaption !== page.caption;

        return {
          ...page,
          title: nextTitle,
          caption: nextCaption,
          copyStatus: input.confirmed ? "confirmed" : page.copyStatus ?? "prefilled",
          copySource: didEdit ? "manual" : page.copySource ?? "metadata",
        };
      }),
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
  const orderedNotes = [...project.notes].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  if (orderedPhotos.length === 0) {
    return {
      ...project,
      bookDraft: {
        ...project.bookDraft,
        pages: [],
        summary:
          "Add approved photos and a few memory notes so the first curated proof has enough story to work with.",
      },
    };
  }

  const leadPhoto = chooseLeadPhoto(orderedPhotos);
  const openingNote = orderedNotes[0];
  const closingNote = orderedNotes.at(-1);
  const remainingPhotos = orderedPhotos.filter((photo) => photo.id !== leadPhoto.id);
  const closingPhotos = remainingPhotos.length >= 3 ? remainingPhotos.slice(-2) : [];
  const bodySeed = closingPhotos.length
    ? remainingPhotos.slice(0, Math.max(remainingPhotos.length - closingPhotos.length, 0))
    : remainingPhotos;
  const chapterAnchor = openingNote && bodySeed.length ? bodySeed[0] : undefined;
  const bodyPhotos = chapterAnchor ? bodySeed.slice(1) : bodySeed;
  const generatedPages: BookPage[] = [buildOpenerPage(project, leadPhoto, openingNote)];

  if (openingNote) {
    generatedPages.push(buildChapterPage(project, chapterAnchor, openingNote));
  }

  for (let index = 0; index < bodyPhotos.length;) {
    const chunkSize = chooseChunkSize(bodyPhotos, index);
    const chunk = bodyPhotos.slice(index, index + chunkSize);

    if (chunk.length > 0) {
      generatedPages.push(buildStoryPage(project, chunk, generatedPages.length));
    }

    index += chunkSize;
  }

  if (closingPhotos.length) {
    generatedPages.push(buildClosingPage(project, closingPhotos, closingNote));
  } else if (generatedPages.length === 1 && remainingPhotos.length) {
    generatedPages.push(buildClosingPage(project, remainingPhotos, closingNote));
  }

  const pages = generatedPages.map((page) =>
    preserveExistingEditorialChoices(project, page),
  );
  const soloPages = pages.filter((page) => page.photoIds.length === 1).length;
  const multiPhotoPages = pages.length - soloPages;
  const unconfirmedCopy = pages.filter((page) => page.copyStatus !== "confirmed").length;

  return {
    ...project,
    bookDraft: {
      ...project.bookDraft,
      status: "reviewing",
      pages,
      summary: `Curated ${pages.length}-spread draft from ${orderedPhotos.length} approved photos: ${soloPages} cinematic single-image pages, ${multiPhotoPages} paced multi-photo spreads, and ${unconfirmedCopy} prefilled copy blocks still ready for confirmation.`,
    },
  };
}
