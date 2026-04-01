import { createMockProject, createSeedProjects, getProjectSummary } from "./mock-data";
import { normalizeProjectDraftState } from "./editorial";
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

function slugifyEmail(email: string) {
  return email.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function getInviteId(email: string) {
  return `invite-${slugifyEmail(email) || "collaborator"}`;
}

function getInviteMemberId(email: string) {
  return slugifyEmail(email) || `collaborator-${Date.now()}`;
}

function getInviteDisplayName(input: { name?: string; email: string }) {
  const trimmedName = input.name?.trim();
  if (trimmedName) {
    return trimmedName;
  }

  return input.email.split("@")[0] ?? "Collaborator";
}

function getAvatarLabel(name: string, email: string) {
  return (name.trim().slice(0, 1) || email.slice(0, 1) || "C").toUpperCase();
}

export function inviteCollaborator(
  project: Project,
  input: {
    name: string;
    email: string;
    invitedByMemberId?: string;
    sentAt?: string;
    token?: string;
  },
): Project {
  const normalizedEmail = input.email.trim().toLowerCase();
  const inviteId = getInviteId(normalizedEmail);
  const sentAt = input.sentAt ?? new Date().toISOString();
  const name = getInviteDisplayName({ name: input.name, email: normalizedEmail });
  const nextInvite = {
    id: inviteId,
    name,
    email: normalizedEmail,
    role: "collaborator" as const,
    status: "sent" as const,
    sentAt,
    invitedByMemberId: input.invitedByMemberId,
    token: input.token,
  };

  return {
    ...project,
    invites: [
      ...project.invites.filter((invite) => invite.id !== inviteId),
      nextInvite,
    ],
  };
}

export function addCollaborator(
  project: Project,
  input: { name: string; email: string },
) {
  return inviteCollaborator(project, input);
}

export function acceptProjectInvite(
  project: Project,
  input: {
    acceptedAt?: string;
    acceptedByUserId: string;
    acceptedEmail: string;
    acceptedName?: string;
    inviteId: string;
  },
): Project {
  const normalizedEmail = input.acceptedEmail.trim().toLowerCase();
  const invite = project.invites.find((entry) => entry.id === input.inviteId);

  if (!invite || invite.email.toLowerCase() !== normalizedEmail) {
    return project;
  }

  const acceptedAt = input.acceptedAt ?? new Date().toISOString();
  const existingMember = project.members.find(
    (member) => member.email.toLowerCase() === normalizedEmail,
  );
  const name = getInviteDisplayName({
    name: input.acceptedName ?? invite.name,
    email: normalizedEmail,
  });

  const nextMember = existingMember
    ? {
        ...existingMember,
        name,
        email: normalizedEmail,
        avatarLabel: existingMember.avatarLabel || getAvatarLabel(name, normalizedEmail),
      }
    : {
        id: input.acceptedByUserId || getInviteMemberId(normalizedEmail),
        name,
        email: normalizedEmail,
        role: invite.role,
        avatarLabel: getAvatarLabel(name, normalizedEmail),
        homeBase: "Joined by invite",
      };

  return {
    ...project,
    members: [
      ...project.members.filter((member) => member.email.toLowerCase() !== normalizedEmail),
      nextMember,
    ],
    invites: project.invites.map((entry) =>
      entry.id === input.inviteId
        ? {
            ...entry,
            name,
            status: "accepted",
            acceptedAt,
            acceptedByUserId: input.acceptedByUserId,
            token: undefined,
          }
        : entry,
    ),
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
    return photos[0].orientation === "landscape" ? "full_bleed" : "hero";
  }

  if (photos.length === 2) {
    return photos[0].orientation === photos[1].orientation ? "minimal_grid" : "caption";
  }

  return chunkIndex % 2 === 0 ? "family_recap" : "collage";
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
    style: project.type === "trip" ? "timeline" : "caption",
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
    style: photos.length === 1 ? "caption" : "family_recap",
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

type EditorialChapter = {
  id: string;
  index: number;
  label: string;
  note?: ProjectNote;
  photos: PhotoAsset[];
};

function getChapterKey(project: Project, photo: PhotoAsset) {
  if (project.type === "yearbook") {
    return new Date(photo.capturedAt).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: project.timezone,
    });
  }

  return (
    photo.locationLabel?.trim() ||
    new Date(photo.capturedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: project.timezone,
    })
  );
}

function buildEditorialChapters(
  project: Project,
  orderedPhotos: PhotoAsset[],
  orderedNotes: ProjectNote[],
) {
  const chapters: EditorialChapter[] = [];

  for (const photo of orderedPhotos) {
    const key = getChapterKey(project, photo);
    const lastChapter = chapters.at(-1);

    if (!lastChapter || lastChapter.label !== key || lastChapter.photos.length >= 6) {
      chapters.push({
        id: `chapter-${chapters.length + 1}`,
        index: chapters.length,
        label: key,
        note: orderedNotes[chapters.length],
        photos: [photo],
      });
      continue;
    }

    lastChapter.photos.push(photo);
  }

  return chapters;
}

function isPanoramaPhoto(photo: PhotoAsset) {
  const bestVersion = [...photo.versions].sort(
    (left, right) => right.width * right.height - left.width * left.height,
  )[0];

  if (!bestVersion) {
    return false;
  }

  return bestVersion.width / bestVersion.height >= 1.75;
}

function isDetailPhoto(photo: PhotoAsset) {
  const haystack = `${photo.title} ${photo.qualityNotes.join(" ")}`.toLowerCase();
  return ["food", "coffee", "ticket", "detail", "close", "breakfast", "candid"].some(
    (keyword) => haystack.includes(keyword),
  );
}

function buildChapterDividerPage(project: Project, chapter: EditorialChapter): BookPage {
  const noteSentence = chapter.note ? firstSentence(chapter.note.body) : "";
  const firstPhoto = chapter.photos[0];
  const dateLabel = firstPhoto
    ? formatCaptureLabel(project, firstPhoto.capturedAt, {
        month: "long",
        day: "numeric",
      })
    : formatProjectRange(project);

  return {
    id: createPageId("scene_setter", firstPhoto ? [firstPhoto.id] : [chapter.id]),
    style: project.type === "trip" ? "timeline" : "caption",
    storyBeat: "scene_setter",
    title: chapter.note?.title?.trim() || chapter.label,
    caption: truncateCopy(
      noteSentence ||
        `${chapter.label} sets up the next run of pages. Use a quieter divider here so the book breathes before the hero image lands.`,
      220,
    ),
    copyStatus: "prefilled",
    copySource: chapter.note ? "hybrid" : "metadata",
    photoIds:
      project.type === "trip"
        ? chapter.photos.slice(0, 2).map((photo) => photo.id)
        : firstPhoto
          ? [firstPhoto.id]
          : [],
    layoutNote:
      project.type === "trip"
        ? `Use the route context from ${dateLabel} to orient the reader before the next image-led spread.`
        : "Keep this divider sparse with disciplined typography and a lot of white space.",
    curationNote:
      "Chapter dividers keep the book from feeling like a long feed of equally weighted pages.",
    approved: false,
  };
}

function buildHeroSpread(project: Project, chapter: EditorialChapter, heroPhoto: PhotoAsset): BookPage {
  const moment = describePhotoMoment(project, [heroPhoto]);
  const title = chapter.note?.title?.trim()
    ? chapter.note.title.trim()
    : moment.location
      ? `${moment.location} carried this chapter`
      : `${sentenceCase(moment.timeOfDay)} became the visual anchor`;
  const caption = truncateCopy(
    chapter.note
      ? firstSentence(chapter.note.body)
      : `${moment.location ?? project.title} on ${moment.dateLabel}. Keep the opening caption short and let the image do most of the work.`,
    220,
  );

  return {
    id: createPageId("highlight", [heroPhoto.id]),
    style: isPanoramaPhoto(heroPhoto) || heroPhoto.orientation === "landscape"
      ? "full_bleed"
      : "hero",
    storyBeat: chapter.index === 0 ? "opener" : "highlight",
    title,
    caption,
    copyStatus: "prefilled",
    copySource: chapter.note ? "hybrid" : "metadata",
    photoIds: [heroPhoto.id],
    layoutNote:
      "Reserve the hero spread for the image that can carry an entire chapter without supporting clutter.",
    curationNote:
      "The focal image should read like a deliberate editorial pick, not just the first image in the timeline.",
    approved: false,
  };
}

function buildSupportSpread(
  project: Project,
  chapter: EditorialChapter,
  photos: PhotoAsset[],
): BookPage | null {
  if (!photos.length) {
    return null;
  }

  const moment = describePhotoMoment(project, photos);
  const detailHeavy = photos.every((photo) => isDetailPhoto(photo));
  const style =
    photos.length === 1
        ? "caption"
      : photos.length === 2
        ? "minimal_grid"
      : detailHeavy
          ? "family_recap"
          : "minimal_grid";

  return {
    id: createPageId("details", photos.map((photo) => photo.id)),
    style,
    storyBeat: "details",
    title:
      style === "family_recap"
        ? `${chapter.label} in the smaller details`
        : `${moment.location ?? chapter.label} needed context`,
    caption: truncateCopy(
      detailHeavy
        ? `Keep the food, small textures, and supporting ephemera together so they read as one collected memory instead of stealing a hero page.`
        : `These supporting frames add context without competing with the chapter opener. Keep the pacing calm and the hierarchy obvious.`,
      230,
    ),
    copyStatus: "prefilled",
    copySource: "metadata",
    photoIds: photos.map((photo) => photo.id),
    layoutNote:
      style === "family_recap"
        ? "Use a denser, smaller treatment for details and tactile memories."
        : "Support pages should widen the story without flattening the book into repeated hero spreads.",
    curationNote:
      "Context spreads are where the reader gets atmosphere, details, and supporting beats around the main image.",
    approved: false,
  };
}

function buildReflectionSpread(project: Project, chapter: EditorialChapter, photos: PhotoAsset[]): BookPage | null {
  if (!photos.length) {
    return null;
  }

  const style =
    photos.length >= 4
      ? "collage"
      : photos.length === 3
        ? "family_recap"
        : "caption";

  return {
    id: createPageId("reflection", photos.map((photo) => photo.id)),
    style,
    storyBeat: "reflection",
    title: `${chapter.label} after the hero moment`,
    caption: truncateCopy(
      `Alternate the quieter pages with the denser ones here so the book keeps a deliberate rhythm instead of repeating the same layout back to back.`,
      220,
    ),
    copyStatus: "prefilled",
    copySource: "metadata",
    photoIds: photos.map((photo) => photo.id),
    layoutNote:
      style === "collage"
        ? "Use a compact candid grid that feels intentional, not overfilled."
        : "Reflection spreads should gather repeat motifs and in-between frames without crowding the page.",
    curationNote:
      "Use this page to lower the volume after the hero spread and collect the chapter's supporting memory texture.",
    approved: false,
  };
}

function buildChapterClosingSpread(
  project: Project,
  chapter: EditorialChapter,
  photos: PhotoAsset[],
): BookPage | null {
  if (!photos.length) {
    return null;
  }

  const noteSentence = chapter.note ? firstSentence(chapter.note.body) : "";

  return {
    id: createPageId("closing", photos.map((photo) => photo.id)),
    style: photos.length > 1 ? "caption" : "caption",
    storyBeat: "closing",
    title: `${chapter.label} settled into a softer finish`,
    caption: truncateCopy(
      noteSentence ||
        "End the chapter on a quieter note so the overall book has ebb and flow instead of constant visual intensity.",
      220,
    ),
    copyStatus: "prefilled",
    copySource: chapter.note ? "hybrid" : "metadata",
    photoIds: photos.map((photo) => photo.id),
    layoutNote:
      "Closing pages should feel calmer and more spacious than the chapter's hero and detail spreads.",
    curationNote:
      "A softer closer gives the next divider or hero spread room to feel distinct.",
    approved: false,
  };
}

function buildEditorialPages(
  project: Project,
  chapter: EditorialChapter,
): BookPage[] {
  const heroPhoto = chooseLeadPhoto(chapter.photos);
  const remainingPhotos = chapter.photos.filter((photo) => photo.id !== heroPhoto.id);
  const pages: BookPage[] = [];

  if (project.type === "yearbook" || chapter.index > 0) {
    pages.push(buildChapterDividerPage(project, chapter));
  }

  pages.push(buildHeroSpread(project, chapter, heroPhoto));

  if (remainingPhotos.length) {
    const supportSlice = remainingPhotos.slice(0, Math.min(2, remainingPhotos.length));
    const supportPage = buildSupportSpread(project, chapter, supportSlice);
    if (supportPage) {
      pages.push(supportPage);
    }
  }

  if (remainingPhotos.length > 2) {
    const reflectionPhotos = remainingPhotos.slice(2, Math.min(6, remainingPhotos.length));
    const reflectionPage = buildReflectionSpread(project, chapter, reflectionPhotos);
    if (reflectionPage) {
      pages.push(reflectionPage);
    }
  }

  if (remainingPhotos.length > 4) {
    const closingPage = buildChapterClosingSpread(project, chapter, remainingPhotos.slice(-2));
    if (closingPage) {
      pages.push(closingPage);
    }
  }

  return pages;
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
  const normalizedProject = normalizeProjectDraftState(project);
  const orderedPhotos = [...normalizedProject.photos]
    .filter((photo) => photo.approved)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const orderedNotes = [...normalizedProject.notes].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  if (orderedPhotos.length === 0) {
    return {
      ...normalizedProject,
      bookDraft: {
        ...normalizedProject.bookDraft,
        pages: [],
        summary:
          "Add approved photos and a few memory notes so the first curated proof has enough story to work with.",
      },
    };
  }
  const chapters = buildEditorialChapters(normalizedProject, orderedPhotos, orderedNotes);
  const generatedPages = chapters.flatMap((chapter) =>
    buildEditorialPages(normalizedProject, chapter),
  );

  const pages = generatedPages.map((page) =>
    preserveExistingEditorialChoices(normalizedProject, page),
  );
  const heroPages = pages.filter((page) =>
    ["full_bleed", "hero"].includes(page.style),
  ).length;
  const densePages = pages.filter((page) =>
    ["minimal_grid", "collage", "family_recap", "timeline"].includes(
      page.style,
    ),
  ).length;
  const unconfirmedCopy = pages.filter((page) => page.copyStatus !== "confirmed").length;

  return {
    ...normalizedProject,
    bookDraft: {
      ...normalizedProject.bookDraft,
      status: "reviewing",
      pages,
      summary: `Curated ${pages.length}-spread draft across ${chapters.length} chapters from ${orderedPhotos.length} approved photos: ${heroPages} hero spreads, ${densePages} detail grids, and ${unconfirmedCopy} prefilled copy blocks ready for confirmation.`,
    },
  };
}
