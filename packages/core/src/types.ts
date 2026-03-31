export type ProjectType = "trip" | "yearbook";
export type YearbookCycle =
  | "calendar_year"
  | "dating_anniversary"
  | "wedding_anniversary";
export type BookDraftFormatId =
  | "8x8-square"
  | "10x10-square"
  | "12x12-square"
  | "11x8.5-landscape";
export type BookDraftFormat =
  | "8x8 square"
  | "10x10 square"
  | "12x12 square"
  | "11x8.5 landscape";
export type BookStyleMode =
  | "minimal_editorial"
  | "warm_scrapbook"
  | "clean_modern"
  | "bold_travel"
  | "timeless_yearbook";
export type BookCaptionTone = "factual" | "warm" | "reflective" | "playful";
export type BookStoryMode =
  | "route_story"
  | "day_by_day"
  | "location_clusters"
  | "theme_clusters"
  | "month_by_month"
  | "seasonal"
  | "people_focus";
export type BookPrintPreviewMode = "clean" | "print_safe" | "bleed";
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
  | "hero"
  | "full_bleed"
  | "balanced"
  | "collage"
  | "recap"
  | "diptych"
  | "chapter"
  | "mosaic"
  | "closing"
  | "hero_full_bleed"
  | "hero_support_strip"
  | "balanced_two_up"
  | "four_up_grid"
  | "dense_candid_grid"
  | "panorama_spread"
  | "text_divider"
  | "photo_journal"
  | "memorabilia_spread"
  | "pattern_repetition"
  | "burst_sequence"
  | "map_timeline";
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
  format: BookDraftFormat;
  status: "draft" | "reviewing" | "approved";
  themeId: string;
  summary: string;
  pages: BookPage[];
}

export interface BookDraftEditorState {
  formatId: BookDraftFormatId;
  styleMode: BookStyleMode;
  fontPresetId: string;
  captionTone: BookCaptionTone;
  storyMode: BookStoryMode;
  printPreviewMode: BookPrintPreviewMode;
  density: number;
  showChapterDividers: boolean;
  showDates: boolean;
  showHandwrittenNotes: boolean;
  showLocations: boolean;
  showMaps: boolean;
  showMemorabilia: boolean;
  lockedPageIds: string[];
  lockedPhotoIds: string[];
  photoCaptions: Record<string, string>;
  updatedAt?: string;
  lastAiRefreshAt?: string;
  aiProvider?: "openai" | "fallback" | "manual";
}

export interface PublishedBookDraft {
  id: string;
  name: string;
  savedAt: string;
  bookDraft: BookDraft;
  editorState: BookDraftEditorState;
  selectedThemeId: string;
  projectTitle: string;
  projectSubtitle: string;
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
  draftEditorState?: BookDraftEditorState;
  publishedDrafts?: PublishedBookDraft[];
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
