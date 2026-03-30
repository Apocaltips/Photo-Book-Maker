import {
  type BookTheme,
  type CreateProjectInput,
  type PhotoAsset,
  type Project,
  type ProjectInvite,
  type ProjectMember,
  type ProjectSummary,
} from "./types";

const editorialThemes: BookTheme[] = [
  {
    id: "golden-hour",
    name: "Golden Hour",
    mood: "Warm travel editorial",
    accent: "#c76c3a",
    typeface: "Cormorant Garamond + Manrope",
  },
  {
    id: "pine-ink",
    name: "Pine & Ink",
    mood: "Clean outdoor journal",
    accent: "#335c52",
    typeface: "Fraunces + Inter",
  },
  {
    id: "coastline",
    name: "Coastline",
    mood: "Soft premium album",
    accent: "#6a7ea8",
    typeface: "Newsreader + Satoshi",
  },
];

const sharedMembers: ProjectMember[] = [
  {
    id: "vince",
    name: "Vince",
    email: "vince@example.com",
    role: "owner",
    avatarLabel: "V",
    homeBase: "Denver, Colorado",
  },
  {
    id: "emma",
    name: "Emma",
    email: "emma@example.com",
    role: "collaborator",
    avatarLabel: "E",
    homeBase: "Fort Collins, Colorado",
  },
];

function cloneThemes() {
  return editorialThemes.map((theme) => ({ ...theme }));
}

function cloneMembers() {
  return sharedMembers.map((member) => ({ ...member }));
}

function photo(
  input: Omit<PhotoAsset, "versions"> & { dimensions: [number, number] },
): PhotoAsset {
  const [width, height] = input.dimensions;

  return {
    id: input.id,
    title: input.title,
    uploaderId: input.uploaderId,
    imageUri: undefined,
    capturedAt: input.capturedAt,
    locationLabel: input.locationLabel,
    locationConfidence: input.locationConfidence,
    orientation: input.orientation,
    mustInclude: input.mustInclude,
    approved: input.approved,
    peopleIds: input.peopleIds,
    faceClusterIds: input.faceClusterIds,
    qualityNotes: input.qualityNotes,
    versions: [
      {
        id: `${input.id}-original`,
        label: "original",
        status: "ready",
        width,
        height,
      },
      {
        id: `${input.id}-enhanced`,
        label: "enhanced",
        status: "ready",
        width,
        height,
      },
      {
        id: `${input.id}-preview`,
        label: "preview",
        status: "ready",
        width: Math.round(width / 2),
        height: Math.round(height / 2),
      },
    ],
  };
}

function buildAcceptedInvites(members: ProjectMember[]): ProjectInvite[] {
  return members.map((member) => ({
    id: `invite-${member.id}`,
    email: member.email,
    role: member.role,
    status: "accepted",
    sentAt: "2026-03-02T18:00:00.000Z",
  }));
}

export function createSeedProjects(): Project[] {
  const weekendTrip: Project = {
    id: "yellowstone-weekend",
    type: "trip",
    title: "Yellowstone Weekend",
    subtitle: "Steam, campfire smoke, and the first bear sighting of the year.",
    status: "needs_resolution",
    timezone: "America/Denver",
    startDate: "2026-05-14",
    endDate: "2026-05-17",
    ownerId: "vince",
    members: cloneMembers(),
    invites: buildAcceptedInvites(sharedMembers),
    notes: [
      {
        id: "note-1",
        authorId: "vince",
        title: "Arrival mood",
        body: "We made it just before sunset and the sky turned orange behind the steam pools.",
        createdAt: "2026-05-14T23:40:00.000Z",
      },
      {
        id: "note-2",
        authorId: "emma",
        title: "Morning checklist",
        body: "Coffee, fog, and that ridiculous elk traffic jam outside the campsite.",
        createdAt: "2026-05-15T14:12:00.000Z",
      },
    ],
    photos: [
      photo({
        id: "photo-1",
        title: "Steam basin arrival",
        uploaderId: "vince",
        capturedAt: "2026-05-14T19:21:00.000Z",
        locationLabel: "Midway Geyser Basin",
        locationConfidence: "exact",
        orientation: "landscape",
        mustInclude: true,
        approved: true,
        peopleIds: ["vince", "emma"],
        faceClusterIds: ["cluster-1", "cluster-2"],
        qualityNotes: ["Needs slight horizon correction."],
        dimensions: [2400, 1600],
      }),
      photo({
        id: "photo-2",
        title: "Campfire portrait",
        uploaderId: "emma",
        capturedAt: "2026-05-14T22:47:00.000Z",
        locationLabel: "Madison Campground",
        locationConfidence: "inferred",
        orientation: "portrait",
        mustInclude: true,
        approved: true,
        peopleIds: ["emma"],
        faceClusterIds: ["cluster-2"],
        qualityNotes: ["Low light rescue queued."],
        dimensions: [1600, 2200],
      }),
      photo({
        id: "photo-3",
        title: "Elk crossing",
        uploaderId: "vince",
        capturedAt: "2026-05-15T08:10:00.000Z",
        locationLabel: undefined,
        locationConfidence: "missing",
        orientation: "landscape",
        mustInclude: false,
        approved: true,
        peopleIds: [],
        faceClusterIds: [],
        qualityNotes: ["Waiting on location confirmation."],
        dimensions: [2600, 1600],
      }),
      photo({
        id: "photo-4",
        title: "Boardwalk laugh",
        uploaderId: "emma",
        capturedAt: "2026-05-15T11:52:00.000Z",
        locationLabel: "Norris Geyser Basin",
        locationConfidence: "exact",
        orientation: "square",
        mustInclude: true,
        approved: false,
        peopleIds: ["vince", "emma"],
        faceClusterIds: ["cluster-1", "cluster-2"],
        qualityNotes: ["Marked for hero opener."],
        dimensions: [1800, 1800],
      }),
      photo({
        id: "photo-5",
        title: "Trail recap",
        uploaderId: "vince",
        capturedAt: "2026-05-16T17:25:00.000Z",
        locationLabel: "Grand Prismatic overlook",
        locationConfidence: "exact",
        orientation: "landscape",
        mustInclude: false,
        approved: true,
        peopleIds: ["vince"],
        faceClusterIds: ["cluster-1"],
        qualityNotes: ["Ready for balanced spread."],
        dimensions: [2400, 1600],
      }),
    ],
    faceClusters: [
      {
        id: "cluster-1",
        suggestedMemberId: "vince",
        confidence: 0.94,
        status: "mapped",
        thumbnailPhotoId: "photo-1",
      },
      {
        id: "cluster-2",
        suggestedMemberId: "emma",
        confidence: 0.92,
        status: "mapped",
        thumbnailPhotoId: "photo-2",
      },
      {
        id: "cluster-3",
        confidence: 0.61,
        status: "unknown",
        thumbnailPhotoId: "photo-3",
      },
    ],
    resolutionTasks: [
      {
        id: "task-1",
        type: "location",
        title: "Confirm elk crossing location",
        detail: "The sunrise wildlife shot has no GPS data and needs a manual park stop.",
        status: "open",
        dueLabel: "Needed before book export",
        assigneeIds: ["vince", "emma"],
      },
      {
        id: "task-2",
        type: "people",
        title: "Check unknown face cluster",
        detail: "The clustering pass found one more face candidate in the trail recap sequence.",
        status: "in_progress",
        dueLabel: "Today",
        assigneeIds: ["emma"],
      },
    ],
    bookThemes: cloneThemes(),
    selectedThemeId: "golden-hour",
    bookDraft: {
      id: "draft-1",
      title: "Yellowstone Weekend",
      format: "12x12 square",
      status: "reviewing",
      themeId: "golden-hour",
      summary:
        "A warm, steam-heavy travel edit with slow openers, one full-bleed landscape spread, and a final recap page anchored by your campfire notes.",
      pages: [
        {
          id: "page-1",
          style: "hero",
          storyBeat: "opener",
          title: "We arrived with the steam already glowing.",
          caption:
            "The first boardwalk stop set the tone for the whole weekend: dramatic sky, cool air, and just enough quiet to hear the pools breathe.",
          copyStatus: "confirmed",
          copySource: "hybrid",
          photoIds: ["photo-4"],
          layoutNote: "Use the square portrait as an opener with generous margin and title lockup.",
          curationNote:
            "The opener lands on one image and one line of memory so the book immediately feels curated instead of crowded.",
          approved: true,
        },
        {
          id: "page-2",
          style: "diptych",
          storyBeat: "details",
          title: "Night one at Madison",
          caption:
            "Low-light cleanup keeps the campfire warmth without pushing it into fake orange territory.",
          copyStatus: "prefilled",
          copySource: "metadata",
          photoIds: ["photo-2", "photo-1"],
          layoutNote: "Pair the portrait with a tighter supporting landscape on the right.",
          curationNote:
            "This pairing moves from atmosphere to detail, which is the difference between an album spread and a phone gallery.",
          approved: false,
        },
        {
          id: "page-3",
          style: "closing",
          storyBeat: "closing",
          title: "By morning, Yellowstone had its own traffic.",
          caption:
            "Add the wildlife stop once the missing location is confirmed, then hold the recap copy over lots of whitespace.",
          copyStatus: "prefilled",
          copySource: "hybrid",
          photoIds: ["photo-3", "photo-5"],
          layoutNote: "Keep this page airy so the copy breathes.",
          curationNote:
            "The ending should land softer than the opener, with more space and a quieter rhythm.",
          approved: false,
        },
      ],
    },
    mockPrintOrder: {
      id: "order-1",
      status: "reviewing",
      priceCents: 6800,
      shippingName: "Vince Hernandez",
      shippingCity: "Denver, CO",
      estimatedShipWindow: "5-7 business days",
      orderCode: "PBM-YS-2048",
    },
  };

  const yearbook: Project = {
    id: "yearbook-2026",
    type: "yearbook",
    title: "Our 2026 Yearbook",
    subtitle: "Every road trip, rainy walk, and accidental perfect photo from the year.",
    status: "reviewing",
    timezone: "America/Denver",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    year: 2026,
    yearbookCycle: "calendar_year",
    ownerId: "vince",
    members: cloneMembers(),
    invites: buildAcceptedInvites(sharedMembers),
    notes: [
      {
        id: "note-y-1",
        authorId: "emma",
        title: "What this year felt like",
        body: "Lots of quick trips, many coffees, and the kind of photos that feel casual until you see them together.",
        createdAt: "2026-09-03T19:15:00.000Z",
      },
    ],
    photos: [
      photo({
        id: "year-photo-1",
        title: "Rainy city walk",
        uploaderId: "emma",
        capturedAt: "2026-02-21T17:00:00.000Z",
        locationLabel: "Seattle waterfront",
        locationConfidence: "exact",
        orientation: "portrait",
        mustInclude: true,
        approved: true,
        peopleIds: ["emma"],
        faceClusterIds: ["cluster-y-1"],
        qualityNotes: ["Good for a quiet page transition."],
        dimensions: [1600, 2200],
      }),
      photo({
        id: "year-photo-2",
        title: "Canyon overlook",
        uploaderId: "vince",
        capturedAt: "2026-06-18T18:32:00.000Z",
        locationLabel: "Moab",
        locationConfidence: "exact",
        orientation: "landscape",
        mustInclude: true,
        approved: true,
        peopleIds: ["vince", "emma"],
        faceClusterIds: ["cluster-y-1", "cluster-y-2"],
        qualityNotes: ["Full-bleed spread candidate."],
        dimensions: [2400, 1600],
      }),
      photo({
        id: "year-photo-3",
        title: "Cabin breakfast",
        uploaderId: "emma",
        capturedAt: "2026-11-09T09:41:00.000Z",
        locationLabel: "Rocky Mountain cabin",
        locationConfidence: "inferred",
        orientation: "square",
        mustInclude: false,
        approved: true,
        peopleIds: ["vince", "emma"],
        faceClusterIds: ["cluster-y-1", "cluster-y-2"],
        qualityNotes: ["Needs caption polish."],
        dimensions: [1900, 1900],
      }),
    ],
    faceClusters: [
      {
        id: "cluster-y-1",
        suggestedMemberId: "emma",
        confidence: 0.91,
        status: "mapped",
        thumbnailPhotoId: "year-photo-1",
      },
      {
        id: "cluster-y-2",
        suggestedMemberId: "vince",
        confidence: 0.93,
        status: "mapped",
        thumbnailPhotoId: "year-photo-2",
      },
    ],
    resolutionTasks: [],
    bookThemes: cloneThemes(),
    selectedThemeId: "coastline",
    bookDraft: {
      id: "draft-2",
      title: "Our 2026 Yearbook",
      format: "12x12 square",
      status: "reviewing",
      themeId: "coastline",
      summary:
        "A softer annual rhythm with one cinematic summer spread, quiet interludes, and recap captions built from your notes.",
      pages: [
        {
          id: "page-y-1",
          style: "hero",
          storyBeat: "opener",
          title: "A year told in little escapes.",
          caption:
            "Open with the strongest portrait, then let the rest of the year unfurl around it.",
          copyStatus: "confirmed",
          copySource: "hybrid",
          photoIds: ["year-photo-1"],
          layoutNote: "Use a large serif opener and tight copy block.",
          curationNote:
            "The opener frames the whole year in one restrained image before the book expands into bigger moments.",
          approved: true,
        },
        {
          id: "page-y-2",
          style: "full_bleed",
          storyBeat: "highlight",
          title: "Summer needed a full spread.",
          caption:
            "The canyon overlook carries the whole middle act, with enough margin on the caption to keep it premium.",
          copyStatus: "confirmed",
          copySource: "metadata",
          photoIds: ["year-photo-2"],
          layoutNote: "Full-bleed landscape with a restrained lower-third caption.",
          curationNote:
            "Reserve the single-image cinematic spread for the frame that can carry a whole season by itself.",
          approved: true,
        },
        {
          id: "page-y-3",
          style: "mosaic",
          storyBeat: "reflection",
          title: "The cozy part of the year",
          caption:
            "Pair smaller moments late in the book so the annual story ends warm instead of busy.",
          copyStatus: "prefilled",
          copySource: "hybrid",
          photoIds: ["year-photo-3", "year-photo-1"],
          layoutNote: "Two-photo collage with asymmetrical whitespace.",
          curationNote:
            "Late-book detail pages should feel warm and gathered, not like leftover images filling space.",
          approved: false,
        },
      ],
    },
    mockPrintOrder: {
      id: "order-2",
      status: "draft",
      priceCents: 8200,
      shippingName: "Emma Walker",
      shippingCity: "Fort Collins, CO",
      estimatedShipWindow: "6-8 business days",
      orderCode: "PBM-YB-2026",
    },
  };

  return [weekendTrip, yearbook];
}

export function getProjectSummary(project: Project): ProjectSummary {
  return {
    approvedPhotos: project.photos.filter((entry) => entry.approved).length,
    mustIncludePhotos: project.photos.filter((entry) => entry.mustInclude).length,
    openTasks: project.resolutionTasks.filter((task) => task.status !== "resolved").length,
    acceptedInvites: project.invites.filter((invite) => invite.status === "accepted").length,
    pageCount: project.bookDraft.pages.length,
  };
}

export function createMockProject(input: CreateProjectInput): Project {
  const owner: ProjectMember = {
    id: "owner-generated",
    name: input.ownerName,
    email: input.ownerEmail,
    role: "owner",
    avatarLabel: input.ownerName.slice(0, 1).toUpperCase(),
    homeBase: "To be added",
  };

  const titleSeed = input.title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return {
    id: `${input.type}-${titleSeed || "new-project"}`,
    type: input.type,
    title: input.title,
    subtitle: input.subtitle,
    status: "collecting",
    timezone: input.timezone,
    startDate: input.startDate,
    endDate: input.endDate,
    year: input.type === "yearbook" ? Number(input.startDate.slice(0, 4)) : undefined,
    yearbookCycle: input.type === "yearbook" ? input.yearbookCycle ?? "calendar_year" : undefined,
    anniversaryDate:
      input.type === "yearbook" && input.yearbookCycle !== "calendar_year"
        ? input.anniversaryDate ?? input.startDate
        : undefined,
    ownerId: owner.id,
    members: [owner],
    invites: [
      {
        id: `invite-${titleSeed || "new"}`,
        email: owner.email,
        role: "owner",
        status: "accepted",
        sentAt: new Date().toISOString(),
      },
    ],
    notes: [],
    photos: [],
    faceClusters: [],
    resolutionTasks: [],
    bookThemes: cloneThemes(),
    selectedThemeId: editorialThemes[0].id,
    bookDraft: {
      id: `draft-${titleSeed || "new"}`,
      title: input.title,
      format: "12x12 square",
      status: "draft",
      themeId: editorialThemes[0].id,
      summary:
        "The draft book will appear here once uploads and memory notes give the layout engine enough material to curate a real first proof.",
      pages: [],
    },
    mockPrintOrder: {
      id: `order-${titleSeed || "new"}`,
      status: "draft",
      priceCents: 6400,
      shippingName: input.ownerName,
      shippingCity: "Not set yet",
      estimatedShipWindow: "5-7 business days",
      orderCode: `PBM-${(titleSeed || "NEW").toUpperCase().slice(0, 6)}`,
    },
  };
}
