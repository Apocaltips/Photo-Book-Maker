export type ProjectType = "trip" | "yearbook";
export type YearbookCycle =
  | "calendar_year"
  | "dating_anniversary"
  | "wedding_anniversary";
export type MemberRole = "owner" | "collaborator";
export type ProjectStatus =
  | "collecting"
  | "needs_resolution"
  | "reviewing"
  | "ready_to_print"
  | "printed";

export type ResolutionTaskType = "location" | "people" | "order";
export type ResolutionTaskStatus = "open" | "in_progress" | "resolved";
export type PageLayoutStyle =
  | "minimal_grid"
  | "hero"
  | "couple_story"
  | "family_recap"
  | "timeline"
  | "full_bleed"
  | "caption"
  | "balanced"
  | "collage"
  | "recap"
  | "diptych"
  | "chapter"
  | "mosaic"
  | "closing";
export type BookPageStoryBeat =
  | "opener"
  | "scene_setter"
  | "highlight"
  | "details"
  | "reflection"
  | "closing";
export type BookPageCopyStatus = "prefilled" | "confirmed";
export type BookPageCopySource = "metadata" | "note" | "hybrid" | "manual";
export type PrintOrderStatus =
  | "draft"
  | "reviewing"
  | "queued"
  | "confirmed";
export type LocationConfidence = "exact" | "inferred" | "missing";
export type PhotoOrientation = "portrait" | "landscape" | "square";

export interface ProjectMember {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  avatarLabel: string;
  homeBase: string;
}

export interface ProjectInvite {
  id: string;
  email: string;
  role: MemberRole;
  status: "sent" | "accepted";
  sentAt: string;
}

export interface ProjectNote {
  id: string;
  authorId: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface PhotoVersion {
  id: string;
  label: "original" | "enhanced" | "preview";
  status: "ready" | "processing";
  width: number;
  height: number;
}

export interface PhotoAsset {
  id: string;
  title: string;
  uploaderId: string;
  imageUri?: string;
  storagePath?: string;
  mimeType?: string;
  capturedAt: string;
  locationLabel?: string;
  locationConfidence: LocationConfidence;
  orientation: PhotoOrientation;
  mustInclude: boolean;
  approved: boolean;
  peopleIds: string[];
  faceClusterIds: string[];
  versions: PhotoVersion[];
  qualityNotes: string[];
}

export interface FaceCluster {
  id: string;
  suggestedMemberId?: string;
  confidence: number;
  status: "unknown" | "mapped";
  thumbnailPhotoId: string;
}

export interface ResolutionTask {
  id: string;
  type: ResolutionTaskType;
  title: string;
  detail: string;
  status: ResolutionTaskStatus;
  dueLabel: string;
  assigneeIds: string[];
}

export interface BookTheme {
  id: string;
  name: string;
  mood: string;
  accent: string;
  typeface: string;
}

export interface BookPage {
  id: string;
  style: PageLayoutStyle;
  storyBeat: BookPageStoryBeat;
  title: string;
  caption: string;
  copyStatus: BookPageCopyStatus;
  copySource: BookPageCopySource;
  photoIds: string[];
  layoutNote: string;
  curationNote: string;
  approved: boolean;
}

export interface BookDraft {
  id: string;
  title: string;
  format: "12x12 square";
  status: "draft" | "reviewing" | "approved";
  themeId: string;
  summary: string;
  pages: BookPage[];
}

export interface MockPrintOrder {
  id: string;
  status: PrintOrderStatus;
  priceCents: number;
  shippingName: string;
  shippingCity: string;
  estimatedShipWindow: string;
  orderCode: string;
}

export interface Project {
  id: string;
  type: ProjectType;
  title: string;
  subtitle: string;
  status: ProjectStatus;
  timezone: string;
  startDate: string;
  endDate: string;
  year?: number;
  yearbookCycle?: YearbookCycle;
  anniversaryDate?: string;
  ownerId: string;
  members: ProjectMember[];
  invites: ProjectInvite[];
  notes: ProjectNote[];
  photos: PhotoAsset[];
  faceClusters: FaceCluster[];
  resolutionTasks: ResolutionTask[];
  bookThemes: BookTheme[];
  selectedThemeId: string;
  bookDraft: BookDraft;
  mockPrintOrder: MockPrintOrder;
}

export interface CreateProjectInput {
  type: ProjectType;
  title: string;
  subtitle: string;
  startDate: string;
  endDate: string;
  timezone: string;
  ownerName: string;
  ownerEmail: string;
  yearbookCycle?: YearbookCycle;
  anniversaryDate?: string;
}

export interface ProjectSummary {
  approvedPhotos: number;
  mustIncludePhotos: number;
  openTasks: number;
  acceptedInvites: number;
  pageCount: number;
}

export interface AddLocalPhotoInput {
  title: string;
  uri: string;
  storagePath?: string;
  mimeType?: string;
  width: number;
  height: number;
  capturedAt?: string;
  locationLabel?: string;
  locationConfidence?: LocationConfidence;
  qualityNotes?: string[];
  uploaderId: string;
}

export interface AddProjectNoteInput {
  authorId: string;
  title: string;
  body: string;
}
