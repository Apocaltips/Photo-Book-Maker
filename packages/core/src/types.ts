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
export type TemplateCategory =
  | "travel"
  | "couples"
  | "family"
  | "yearbook"
  | "minimal"
  | "premium";
export type ProjectActivityEventType =
  | "project_created"
  | "invite_sent"
  | "invite_accepted"
  | "photos_uploaded"
  | "photo_curated"
  | "note_added"
  | "task_resolved"
  | "template_changed"
  | "draft_saved"
  | "draft_published"
  | "draft_ai_generated"
  | "draft_ai_refreshed"
  | "project_finalized"
  | "proof_exported";
export type PhotoUploadStatus = "queued" | "uploading" | "uploaded" | "failed";

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
  name: string;
  email: string;
  role: MemberRole;
  status: "sent" | "accepted";
  sentAt: string;
  invitedByMemberId?: string;
  token?: string;
  acceptedAt?: string;
  acceptedByUserId?: string;
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

export interface PhotoUploadState {
  batchId?: string;
  errorMessage?: string;
  progress: number;
  remoteUrl?: string;
  status: PhotoUploadStatus;
  updatedAt: string;
}

export interface PhotoAsset {
  id: string;
  title: string;
  uploaderId: string;
  contentHash?: string;
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
  uploadState?: PhotoUploadState;
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
  templateId?: string;
  layoutVariation?: number;
  photoRoles?: AiBookPlanPhotoRole[];
  cropIntents?: AiBookPlanCropIntent[];
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
  templatePackId?: string;
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
  aiProvider?: "openai" | "ollama" | "manual";
}

export interface SpreadTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  layoutStyle: PageLayoutStyle;
  layoutVariation: number;
  minPhotos: number;
  maxPhotos: number;
  tags: string[];
  idealPhotoCount?: number;
  allowedPhotoRoles?: AiPhotoRole[];
  cropSlotBehavior?: "safe-center" | "face-priority" | "full-bleed" | "grid-crop" | "no-crop";
  visualDensity?: "quiet" | "balanced" | "dense";
  rhythmRole?: "opener" | "hero" | "support" | "detail" | "divider" | "closer";
  safeAreaBehavior?: "strict" | "standard" | "bleed-aware";
  bestUseCases?: string[];
  avoidWhen?: string[];
}

export interface BookTemplatePack {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  formatId: BookDraftFormatId;
  styleMode: BookStyleMode;
  fontPresetId: string;
  captionTone: BookCaptionTone;
  storyMode: BookStoryMode;
  themeId: string;
  spreadTemplateIds: string[];
  coverTemplateId: string;
  tags: string[];
  previewAccent: string;
}

export type BookGenerationQuestionId =
  | "tripPurpose"
  | "audience"
  | "bookSize"
  | "mustIncludeMoments"
  | "coverPreference"
  | "namesPrivacy"
  | "mapMemorabiliaPreference"
  | "captionDepth"
  | "density"
  | "tone";

export type BookGenerationCaptionDepth = "short" | "balanced" | "story";
export type BookGenerationDensity = "airy" | "balanced" | "full";
export type AiPhotoRole = "hero" | "support" | "detail" | "texture" | "cover" | "closing";
export type AiCropRegion =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "face"
  | "wide"
  | "safe-full";

export interface BookGenerationQuestionnaireAnswers {
  audience: string;
  bookSize: BookDraftFormatId;
  captionDepth: BookGenerationCaptionDepth;
  coverPreference: string;
  density: BookGenerationDensity;
  mapMemorabiliaPreference: string;
  mustIncludeMoments: string;
  namesPrivacy: string;
  tone: BookCaptionTone;
  tripPurpose: string;
}

export interface BookGenerationQuestion {
  id: BookGenerationQuestionId;
  label: string;
  prompt: string;
  defaultAnswer: string;
  required: boolean;
}

export interface BookGenerationQuestionnaire {
  answers: BookGenerationQuestionnaireAnswers;
  questions: BookGenerationQuestion[];
}

export interface PhotoInsight {
  cacheKey: string;
  captionClues: string[];
  cropSafeRegion: AiCropRegion;
  focalPoint: "center" | "faces" | "landscape" | "detail" | "unknown";
  hasFood: boolean;
  hasPanorama: boolean;
  hasPeople: boolean;
  hasSelfie: boolean;
  hasText: boolean;
  imageQuality: "excellent" | "good" | "usable" | "risky";
  peopleCount: number;
  photoId: string;
  sceneTags: string[];
}

export interface AiBookPlanPhotoRole {
  photoId: string;
  role: AiPhotoRole;
}

export interface AiBookPlanCropIntent {
  photoId: string;
  region: AiCropRegion;
}

export interface AiBookPlanSpread {
  caption: string;
  cropIntents: AiBookPlanCropIntent[];
  id: string;
  photoIds: string[];
  photoRoles: AiBookPlanPhotoRole[];
  rationale: string;
  storyBeat: BookPageStoryBeat;
  templateId: string;
  title: string;
}

export interface AiBookPlanChapter {
  id: string;
  title: string;
  spreadIds: string[];
}

export interface AiBookPlan {
  chapters: AiBookPlanChapter[];
  designScore: number;
  spreadPlans: AiBookPlanSpread[];
  summary: string;
  warnings: string[];
}

export interface BookGenerationQualityReport {
  approvedPhotoCount: number;
  duplicatePhotoIds: string[];
  hasDetailGridSpread: boolean;
  hasHeroSpread: boolean;
  hasPlaceholderCopy: boolean;
  hasQuietCaptionSpread: boolean;
  hasTripContext: boolean;
  pageCount: number;
  score: number;
  unsupportedTemplateIds: string[];
  usedPhotoCount: number;
  usedPhotoPercent: number;
  warnings: string[];
}

export interface GenerationRun {
  completedAt?: string;
  errorMessage?: string;
  id: string;
  modelNames: {
    planner: string;
    vision: string;
    fallbackPlanner?: string;
  };
  progress: string[];
  qualityReport?: BookGenerationQualityReport;
  savedDraftVersionId?: string;
  startedAt: string;
  status: "queued" | "analyzing_photos" | "planning" | "validating" | "saved" | "failed";
  validationWarnings: string[];
}

export interface UploadBatch {
  id: string;
  createdAt: string;
  failedCount: number;
  projectId: string;
  status: "queued" | "uploading" | "completed" | "failed" | "partial";
  successfulCount: number;
  totalCount: number;
  updatedAt: string;
}

export interface ProjectActivityEvent {
  id: string;
  actorEmail?: string;
  actorId?: string;
  createdAt: string;
  message: string;
  metadata?: Record<string, string | number | boolean | null>;
  type: ProjectActivityEventType;
}

export interface ProofExportRequest {
  draftId?: string;
  exportedAt?: string;
  includeBleedGuides: boolean;
  includePrintSafeGuides: boolean;
  projectId: string;
  requestedByEmail?: string;
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
  revision?: number;
  updatedAt?: string;
  activity?: ProjectActivityEvent[];
  generationQuestionnaire?: Partial<BookGenerationQuestionnaireAnswers>;
  generationRuns?: GenerationRun[];
  photoInsights?: Record<string, PhotoInsight>;
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

export type BookMakingStepId = "upload" | "design" | "review" | "print";

export type BookMakingStepStatus = "done" | "current" | "waiting" | "blocked";

export interface BookMakingStep {
  id: BookMakingStepId;
  label: string;
  actionLabel: string;
  detail: string;
  status: BookMakingStepStatus;
}

export interface BookMakingGuide {
  currentStepId: BookMakingStepId;
  nextActionLabel: string;
  nextStepDetail: string;
  steps: BookMakingStep[];
}

export interface AddLocalPhotoInput {
  contentHash?: string;
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
