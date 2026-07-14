import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import sharp from "sharp";

const owner = {
  avatarLabel: "A",
  email: "android-tester@example.com",
  homeBase: "Denver, Colorado",
  id: "android-tester",
  name: "Android Tester",
  role: "owner",
};

const palettes = [
  ["#82c8e5", "#f4c95d", "#4f8f76", "#17324d"],
  ["#f2a65a", "#f7d488", "#5b7c99", "#20354a"],
  ["#8fc0a9", "#f4e285", "#d96c75", "#34435e"],
  ["#7ea8be", "#e7b66b", "#4f6d5d", "#273043"],
  ["#b8a1d9", "#f0d37a", "#5f8f8a", "#30364f"],
  ["#ef9f9a", "#f3d9a4", "#4b8793", "#2c4158"],
];

const capCanaLocations = [
  "Cap Cana Marina",
  "Juanillo Beach",
  "Scape Park",
  "Punta Espada",
  "Fishing Lodge",
  "Farallon overlook",
  "Marina promenade",
];

const madeiraLocations = [
  "Funchal",
  "Camara de Lobos",
  "Cabo Girao",
  "Porto Moniz",
  "Seixal",
  "Santana",
  "Pico do Arieiro",
  "Ribeiro Frio",
  "Machico",
  "Ponta do Sol",
  "Curral das Freiras",
  "Sao Vicente",
];

function getDimensions(index) {
  if (index % 7 === 0) {
    return { height: 1000, orientation: "square", width: 1000 };
  }

  if (index % 5 === 0) {
    return { height: 1200, orientation: "portrait", width: 900 };
  }

  return { height: 800, orientation: "landscape", width: 1200 };
}

function makeVersions(photoId, width, height) {
  return [
    { height, id: `${photoId}-original`, label: "original", status: "ready", width },
    { height, id: `${photoId}-enhanced`, label: "enhanced", status: "ready", width },
    {
      height: Math.round(height / 2),
      id: `${photoId}-preview`,
      label: "preview",
      status: "ready",
      width: Math.round(width / 2),
    },
  ];
}

function createPhoto(projectId, index, location, capturedAt) {
  const number = index + 1;
  const photoId = `${projectId}-photo-${String(number).padStart(2, "0")}`;
  const dimensions = getDimensions(number);
  const fileName = `${String(number).padStart(2, "0")}-${location
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}.jpg`;

  return {
    approved: true,
    capturedAt,
    faceClusterIds: [],
    id: photoId,
    imageUri: "",
    locationConfidence: "exact",
    locationLabel: location,
    mimeType: "image/jpeg",
    mustInclude: number === 1 || number % 11 === 0,
    orientation: dimensions.orientation,
    peopleIds: number % 4 === 0 ? [owner.id] : [],
    qualityNotes: number % 9 === 0 ? ["A quiet detail frame for pacing."] : [],
    storagePath: `local-uploads/${projectId}/${fileName}`,
    title: `${location} moment ${number}`,
    uploaderId: owner.id,
    versions: makeVersions(photoId, dimensions.width, dimensions.height),
  };
}

function createProject(input) {
  const createdAt = "2026-05-01T16:00:00.000Z";
  const photos = Array.from({ length: input.photoCount }, (_, index) => {
    const location = input.locations[index % input.locations.length];
    const capturedAt = new Date(Date.parse(input.startDate) + index * 3_600_000).toISOString();
    return createPhoto(input.id, index, location, capturedAt);
  });

  return {
    activity: [],
    bookDraft: {
      format: "12x12 square",
      id: `draft-${input.id}`,
      pages: [],
      status: "draft",
      summary: "A travel story ready for an editorial first draft.",
      themeId: "golden-hour",
      title: input.title,
    },
    bookThemes: [
      {
        accent: "#d98555",
        id: "golden-hour",
        mood: "Warm, bright, and editorial",
        name: "Golden Hour",
        typeface: "Serif display with clean sans text",
      },
    ],
    endDate: input.endDate,
    faceClusters: [],
    generationRuns: [],
    id: input.id,
    invites: [
      {
        acceptedAt: createdAt,
        acceptedByUserId: owner.id,
        email: owner.email,
        id: `invite-${input.id}`,
        name: owner.name,
        role: "owner",
        sentAt: createdAt,
        status: "accepted",
      },
    ],
    members: [owner],
    notes: [
      {
        authorId: owner.id,
        body: input.storyNote,
        createdAt,
        id: `note-${input.id}`,
        title: "What the trip felt like",
      },
    ],
    ownerId: owner.id,
    photos,
    resolutionTasks: [],
    revision: 1,
    selectedThemeId: "golden-hour",
    startDate: input.startDate,
    status: "collecting",
    subtitle: input.subtitle,
    timezone: "America/Denver",
    title: input.title,
    type: "trip",
    updatedAt: createdAt,
  };
}

function createFixtureProjects() {
  return [
    createProject({
      endDate: "2026-05-07T23:00:00.000Z",
      id: "trip-cap-cana-alpha-13",
      locations: capCanaLocations,
      photoCount: 13,
      startDate: "2026-05-03T14:00:00.000Z",
      storyNote:
        "Keep the book relaxed and sunlit, with the marina arrival first and the final beach walk as the quiet close.",
      subtitle: "Marina mornings, bright water, and an unhurried final walk.",
      title: "Cap Cana 2026 Trip",
    }),
    createProject({
      endDate: "2026-06-18T23:00:00.000Z",
      id: "trip-madeira-alpha-60",
      locations: madeiraLocations,
      photoCount: 60,
      startDate: "2026-06-10T08:00:00.000Z",
      storyNote:
        "Tell the route from Funchal through the mountain drives and north-coast pools, balancing wide landscapes with markets, meals, and roadside details.",
      subtitle: "Mountain roads, Atlantic weather, and sixty frames from the island.",
      title: "Madeira Island 60 Photo Trip",
    }),
  ];
}

function escapeXml(value) {
  return value.replace(/[<>&'"]/g, (character) => {
    const entities = { '"': "&quot;", "&": "&amp;", "'": "&apos;", "<": "&lt;", ">": "&gt;" };
    return entities[character];
  });
}

async function writePhotoImage(dataDir, photo, index) {
  const original = photo.versions.find((version) => version.label === "original");
  const width = original.width;
  const height = original.height;
  const [sky, sun, ground, ink] = palettes[index % palettes.length];
  const horizon = Math.round(height * (0.52 + (index % 4) * 0.04));
  const label = escapeXml(photo.locationLabel);
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="${sky}"/>
      <circle cx="${Math.round(width * (0.18 + (index % 5) * 0.14))}" cy="${Math.round(
        height * 0.2,
      )}" r="${Math.round(Math.min(width, height) * 0.09)}" fill="${sun}"/>
      <path d="M0 ${horizon} L${Math.round(width * 0.28)} ${Math.round(
        horizon * 0.63,
      )} L${Math.round(width * 0.55)} ${horizon} L${Math.round(width * 0.76)} ${Math.round(
        horizon * 0.7,
      )} L${width} ${horizon} V${height} H0 Z" fill="${ground}"/>
      <path d="M0 ${Math.round(height * 0.72)} Q${Math.round(width * 0.5)} ${Math.round(
        height * (0.62 + (index % 3) * 0.05),
      )} ${width} ${Math.round(height * 0.7)} V${height} H0 Z" fill="${ink}" opacity="0.28"/>
      <text x="${Math.round(width * 0.06)}" y="${Math.round(
        height * 0.9,
      )}" font-family="Arial, sans-serif" font-size="${Math.round(
        Math.min(width, height) * 0.055,
      )}" font-weight="700" fill="#ffffff">${label}</text>
    </svg>`;
  const filePath = join(dataDir, ...photo.storagePath.split("/"));

  await mkdir(dirname(filePath), { recursive: true });
  await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toFile(filePath);
}

export async function prepareLocalAlphaFixtureStore(dataDir) {
  const projects = createFixtureProjects();
  await mkdir(dataDir, { recursive: true });

  let imageIndex = 0;
  for (const project of projects) {
    for (const photo of project.photos) {
      await writePhotoImage(dataDir, photo, imageIndex);
      imageIndex += 1;
    }
  }

  await writeFile(join(dataDir, "projects.json"), `${JSON.stringify(projects, null, 2)}\n`, "utf8");

  return projects;
}
