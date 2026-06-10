import { describe, expect, it } from "vitest";
import {
  BOOK_TEMPLATE_PACKS,
  SPREAD_TEMPLATES,
  addPhotosToProject,
  applyBookTemplatePack,
  buildBookGenerationQuestionnaire,
  buildProofHtml,
  createProjectRecord,
  finalizeProject,
  getBookMakingGuide,
  getAiTemplateCatalogForPrompt,
  getPhotoInsightCacheKey,
  listOpenTasks,
  markGenerationRunFailed,
  materializeAiBookPlan,
  parseAiBookPlanJson,
  publishCurrentDraft,
  resolveProjectTask,
  saveWorkingDraft,
  scoreGeneratedBook,
  upsertGenerationRun,
} from "./index";

function createProjectWithPhotos() {
  return addPhotosToProject(
    createProjectRecord({
      endDate: "2026-07-14",
      ownerEmail: "owner@example.com",
      ownerName: "Owner",
      startDate: "2026-07-11",
      subtitle: "A test trip",
      timezone: "America/Denver",
      title: "Coastal Weekend",
      type: "trip",
    }),
    Array.from({ length: 6 }, (_, index) => ({
      capturedAt: `2026-07-1${index % 4}T12:00:00.000Z`,
      height: index % 2 === 0 ? 1200 : 1800,
      locationConfidence: "exact" as const,
      locationLabel: "Cannon Beach",
      title: `Photo ${index + 1}`,
      uploaderId: "owner",
      uri: `https://example.com/photo-${index + 1}.jpg`,
      width: index % 2 === 0 ? 1800 : 1200,
    })),
  );
}

describe("template catalog", () => {
  it("ships the v1 template-pack and spread-template floor", () => {
    expect(BOOK_TEMPLATE_PACKS).toHaveLength(12);
    expect(SPREAD_TEMPLATES).toHaveLength(64);
  });

  it("persists template pack choices onto draft pages", () => {
    const project = createProjectWithPhotos();
    const pack = BOOK_TEMPLATE_PACKS.find((entry) => entry.id === "coastal-lookbook");

    expect(pack).toBeDefined();

    const updatedProject = applyBookTemplatePack(project, pack!.id);

    expect(updatedProject.draftEditorState?.templatePackId).toBe(pack!.id);
    expect(updatedProject.selectedThemeId).toBe(pack!.themeId);
    expect(updatedProject.bookDraft.pages[0]?.templateId).toBe(pack!.spreadTemplateIds[0]);
    expect(updatedProject.bookDraft.pages[0]?.layoutVariation).toBeTypeOf("number");
  });

  it("narrows the AI prompt catalog to the selected book style", () => {
    const pack = BOOK_TEMPLATE_PACKS.find((entry) => entry.id === "coastal-lookbook")!;
    const catalog = getAiTemplateCatalogForPrompt(pack.id);
    const catalogTemplateIds = new Set(
      catalog.spreadTemplates.map((template) => template.id),
    );

    expect(catalog.bookTemplatePacks).toHaveLength(1);
    expect(catalog.bookTemplatePacks[0]?.id).toBe(pack.id);
    expect(catalog.spreadTemplates.length).toBeGreaterThan(0);
    expect(
      catalog.spreadTemplates.every((template) =>
        pack.spreadTemplateIds.includes(template.id),
      ),
    ).toBe(true);
    expect(catalogTemplateIds.has("collage-1")).toBe(false);
  });
});

describe("project collaboration model", () => {
  it("tracks revision and activity without changing the project shape", () => {
    const project = createProjectRecord({
      endDate: "2026-07-14",
      ownerEmail: "owner@example.com",
      ownerName: "Owner",
      startDate: "2026-07-11",
      subtitle: "A test trip",
      timezone: "America/Denver",
      title: "Coastal Weekend",
      type: "trip",
    });

    expect(project.revision).toBe(1);
    expect(project.activity?.[0]?.type).toBe("project_created");
    expect(project.updatedAt).toBeTruthy();
  });

  it("blocks final print readiness until resolution tasks are complete", () => {
    const project = addPhotosToProject(
      createProjectRecord({
        endDate: "2026-07-14",
        ownerEmail: "owner@example.com",
        ownerName: "Owner",
        startDate: "2026-07-11",
        subtitle: "A test trip",
        timezone: "America/Denver",
        title: "Coastal Weekend",
        type: "trip",
      }),
      [
        {
          height: 1200,
          locationConfidence: "missing",
          title: "No GPS",
          uploaderId: "owner",
          uri: "https://example.com/no-gps.jpg",
          width: 1600,
        },
      ],
    );

    expect(listOpenTasks([project])).toHaveLength(1);
    expect(finalizeProject(project).status).toBe("needs_resolution");

    const resolvedProject = resolveProjectTask(project, project.resolutionTasks[0]!.id, {
      locationLabel: "Cannon Beach",
    });

    expect(finalizeProject(resolvedProject).status).toBe("ready_to_print");
  });

  it("skips duplicate imported photos by stable title", () => {
    const project = createProjectRecord({
      endDate: "2026-07-14",
      ownerEmail: "owner@example.com",
      ownerName: "Owner",
      startDate: "2026-07-11",
      subtitle: "A test trip",
      timezone: "America/Denver",
      title: "Coastal Weekend",
      type: "trip",
    });

    const firstImport = addPhotosToProject(project, [
      {
        capturedAt: "2026-07-11T12:00:00.000Z",
        height: 1200,
        locationConfidence: "exact",
        locationLabel: "Cannon Beach",
        title: "IMG 1001",
        uploaderId: "owner",
        uri: "https://example.com/img-1001.jpg",
        width: 1600,
      },
    ]);
    const secondImport = addPhotosToProject(firstImport, [
      {
        capturedAt: "2026-07-11T12:00:00.000Z",
        height: 1200,
        locationConfidence: "exact",
        locationLabel: "Cannon Beach",
        title: "img-1001",
        uploaderId: "owner",
        uri: "https://example.com/img-1001-copy.jpg",
        width: 1600,
      },
      {
        capturedAt: "2026-07-11T12:01:00.000Z",
        height: 1200,
        locationConfidence: "exact",
        locationLabel: "Cannon Beach",
        title: "IMG 1002",
        uploaderId: "owner",
        uri: "https://example.com/img-1002.jpg",
        width: 1600,
      },
    ]);

    expect(secondImport.photos.map((photo) => photo.title)).toEqual([
      "IMG 1001",
      "IMG 1002",
    ]);
  });

  it("skips duplicate imported photos by content hash even when names differ", () => {
    const project = createProjectRecord({
      endDate: "2026-07-14",
      ownerEmail: "owner@example.com",
      ownerName: "Owner",
      startDate: "2026-07-11",
      subtitle: "A test trip",
      timezone: "America/Denver",
      title: "Coastal Weekend",
      type: "trip",
    });

    const importedProject = addPhotosToProject(project, [
      {
        capturedAt: "2026-07-11T12:00:00.000Z",
        contentHash: "same-file-hash",
        height: 1200,
        locationConfidence: "exact",
        locationLabel: "Cannon Beach",
        title: "IMG 1001",
        uploaderId: "owner",
        uri: "https://example.com/img-1001.jpg",
        width: 1600,
      },
      {
        capturedAt: "2026-07-11T12:00:00.000Z",
        contentHash: "same-file-hash",
        height: 1200,
        locationConfidence: "exact",
        locationLabel: "Cannon Beach",
        title: "Vacation favorite copy",
        uploaderId: "owner",
        uri: "https://example.com/img-1001-copy.jpg",
        width: 1600,
      },
    ]);

    expect(importedProject.photos).toHaveLength(1);
    expect(importedProject.photos[0]?.contentHash).toBe("same-file-hash");
  });

  it("guides non-technical users through upload, design, review, and print", () => {
    const emptyProject = createProjectRecord({
      endDate: "2026-07-14",
      ownerEmail: "owner@example.com",
      ownerName: "Owner",
      startDate: "2026-07-11",
      subtitle: "A test trip",
      timezone: "America/Denver",
      title: "Coastal Weekend",
      type: "trip",
    });

    expect(getBookMakingGuide(emptyProject).currentStepId).toBe("upload");

    const uploadedProject = createProjectWithPhotos();
    const uploadedGuide = getBookMakingGuide(uploadedProject);

    expect(uploadedGuide.currentStepId).toBe("design");
    expect(uploadedGuide.nextActionLabel).toBe("Make my book");

    const generatedProject = {
      ...uploadedProject,
      generationRuns: [
        {
          completedAt: "2026-07-11T12:00:00.000Z",
          id: "run-1",
          modelNames: {
            planner: "qwen3:8b",
            vision: "qwen2.5vl:7b",
          },
          progress: ["Draft saved."],
          startedAt: "2026-07-11T12:00:00.000Z",
          status: "saved" as const,
          validationWarnings: [],
        },
      ],
    };

    expect(getBookMakingGuide(generatedProject).currentStepId).toBe("review");

    const approvedProject = {
      ...generatedProject,
      bookDraft: {
        ...generatedProject.bookDraft,
        pages: generatedProject.bookDraft.pages.map((page) => ({
          ...page,
          approved: true,
        })),
      },
    };

    expect(getBookMakingGuide(approvedProject).currentStepId).toBe("print");
  });
});

describe("draft lifecycle and proof output", () => {
  it("publishes a named draft snapshot from the shared editor payload", () => {
    const project = createProjectWithPhotos();
    const updatedProject = saveWorkingDraft(project, {
      draftEditorState: {
        ...project.draftEditorState!,
        templatePackId: "coastal-lookbook",
      },
      title: "Edited Coastal Weekend",
    });
    const publishedProject = publishCurrentDraft(
      updatedProject,
      "Client proof 1",
      {},
    );

    expect(publishedProject.publishedDrafts?.[0]?.name).toBe("Client proof 1");
    expect(publishedProject.publishedDrafts?.[0]?.projectTitle).toBe(
      "Edited Coastal Weekend",
    );
    expect(publishedProject.publishedDrafts?.[0]?.editorState.templatePackId).toBe(
      "coastal-lookbook",
    );
  });

  it("builds a print-review HTML proof with safe-area metadata", () => {
    const project = createProjectWithPhotos();
    const html = buildProofHtml(project, {
      includeBleedGuides: true,
      includePrintSafeGuides: true,
      projectId: project.id,
      requestedByEmail: "owner@example.com",
    });

    expect(html).toContain("<!doctype html>");
    expect(html).toContain(project.title);
    expect(html).toContain("Travel photo book");
    expect(html).toContain("Safe text area");
  });

  it("chooses a cover photo that does not repeat the first interior story reveal when possible", () => {
    const project = createProjectWithPhotos();
    const coverCandidate = project.photos[4]!;
    const storyPhoto = project.photos[0]!;
    const projectWithUnusedCoverCandidate = {
      ...project,
      bookDraft: {
        ...project.bookDraft,
        pages: [
          {
            ...project.bookDraft.pages[0]!,
            photoIds: [storyPhoto.id],
            storyBeat: "highlight" as const,
          },
        ],
      },
      photos: project.photos.map((photo) =>
        photo.id === coverCandidate.id
          ? {
              ...photo,
              locationLabel: "Blue Harbor",
              title: "Blue harbor marina cover",
            }
          : photo,
      ),
    };

    const html = buildProofHtml(projectWithUnusedCoverCandidate);
    const coverPhotoId = html.match(/cover-art[\s\S]*?data-photo-id="([^"]+)"/)?.[1];

    expect(coverPhotoId).toBe(coverCandidate.id);
    expect(projectWithUnusedCoverCandidate.bookDraft.pages.flatMap((page) => page.photoIds)).not.toContain(
      coverPhotoId,
    );
  });
});

describe("AI book generation engine", () => {
  it("builds trip questionnaire defaults from project context", () => {
    const project = createProjectWithPhotos();
    const questionnaire = buildBookGenerationQuestionnaire(project);

    expect(questionnaire.answers.tripPurpose).toBe("A polished printed memory book for this trip.");
    expect(questionnaire.answers.audience).toBe("The people who took the trip");
    expect(questionnaire.answers.bookSize).toBe(project.draftEditorState?.formatId);
    expect(questionnaire.answers.tone).toBe(project.draftEditorState?.captionTone);
    expect(questionnaire.questions.map((question) => question.id)).toContain("mustIncludeMoments");
  });

  it("creates stable photo insight cache keys from photo identity and storage path", () => {
    const project = createProjectWithPhotos();
    const photo = project.photos[0]!;

    expect(getPhotoInsightCacheKey(photo)).toBe(
      getPhotoInsightCacheKey({ ...photo, title: `${photo.title} edited` }),
    );
    expect(getPhotoInsightCacheKey({ ...photo, storagePath: "local-uploads/new-file.jpg" })).not.toBe(
      getPhotoInsightCacheKey(photo),
    );
  });

  it("parses valid AI plans and rejects invalid planner JSON", () => {
    const parsedPlan = parseAiBookPlanJson(
      JSON.stringify({
        chapters: [
          {
            id: "chapter-1",
            title: "Arrival",
            spreadIds: ["spread-1"],
          },
        ],
        designScore: 91,
        spreadPlans: [
          {
            caption: "Cap Cana on the first afternoon.",
            cropIntents: [{ photoId: "photo-1", region: "center" }],
            id: "spread-1",
            photoIds: ["photo-1"],
            photoRoles: [{ photoId: "photo-1", role: "hero" }],
            rationale: "Open with the strongest scenic frame.",
            storyBeat: "opener",
            templateId: "full-bleed-1",
            title: "Arrival in Cap Cana",
          },
        ],
        summary: "A resort trip book with calm editorial pacing.",
        warnings: [],
      }),
    );

    expect(parsedPlan.designScore).toBe(91);
    expect(() => parseAiBookPlanJson("{ not json")).toThrow(/invalid json/i);
  });

  it("repairs AI book plans into supported, duplicate-free, must-include drafts", () => {
    const project = applyBookTemplatePack(
      {
        ...createProjectWithPhotos(),
        photos: createProjectWithPhotos().photos.map((photo, index) => ({
          ...photo,
          mustInclude: index === 5,
        })),
      },
      "trip-editorial-atlas",
    );
    const [firstPhoto, secondPhoto, thirdPhoto, fourthPhoto, fifthPhoto, mustIncludePhoto] =
      project.photos;
    const generated = materializeAiBookPlan(project, {
      chapters: [{ id: "chapter-1", title: "Cap Cana", spreadIds: ["spread-1", "spread-2"] }],
      designScore: 88,
      spreadPlans: [
        {
          caption: "Cap Cana, Dominican Republic opened with water and warm light.",
          cropIntents: [{ photoId: firstPhoto!.id, region: "center" }],
          id: "spread-1",
          photoIds: [
            firstPhoto!.id,
            secondPhoto!.id,
            secondPhoto!.id,
            thirdPhoto!.id,
            fourthPhoto!.id,
            fifthPhoto!.id,
          ],
          photoRoles: [{ photoId: firstPhoto!.id, role: "hero" }],
          rationale: "The opener needs a clean resort hero.",
          storyBeat: "opener",
          templateId: "collage-5",
          title: "Cap Cana Arrival",
        },
        {
          caption: "",
          cropIntents: [],
          id: "spread-2",
          photoIds: [firstPhoto!.id],
          photoRoles: [],
          rationale: "",
          storyBeat: "details",
          templateId: "not-a-real-template",
          title: "",
        },
      ],
      summary: "A better resort book.",
      warnings: [],
    });

    const usedPhotoIds = generated.bookDraft.pages.flatMap((page) => page.photoIds);
    expect(new Set(usedPhotoIds).size).toBe(usedPhotoIds.length);
    expect(usedPhotoIds).toContain(mustIncludePhoto!.id);
    expect(generated.bookDraft.pages.every((page) => page.templateId)).toBe(true);
    expect(generated.bookDraft.pages.every((page) => page.photoIds.length <= 4)).toBe(true);
    expect(generated.bookDraft.summary).toContain("A better resort book.");
    expect(generated.bookDraft.pages[1]?.caption).not.toBe("");
  });

  it("continues repair until small AI batches use at least 85 percent of approved photos", () => {
    const project = addPhotosToProject(
      createProjectRecord({
        endDate: "2026-07-14",
        ownerEmail: "owner@example.com",
        ownerName: "Owner",
        startDate: "2026-07-11",
        subtitle: "Dominican Republic",
        timezone: "America/Denver",
        title: "Cap Cana 2026 Trip",
        type: "trip",
      }),
      Array.from({ length: 13 }, (_, index) => ({
        capturedAt: `2026-07-${String(11 + (index % 4)).padStart(2, "0")}T12:00:00.000Z`,
        height: index % 2 === 0 ? 1800 : 2400,
        locationConfidence: "exact" as const,
        locationLabel: "Cap Cana",
        title: `Cap Cana photo ${index + 1}`,
        uploaderId: "owner",
        uri: `https://example.com/cap-cana-${index + 1}.jpg`,
        width: index % 2 === 0 ? 2400 : 1800,
      })),
    );
    const generated = materializeAiBookPlan(project, {
      chapters: [{ id: "chapter-1", title: "Cap Cana", spreadIds: [] }],
      designScore: 84,
      spreadPlans: project.photos.slice(0, 6).map((photo, index) => ({
        caption: `Cap Cana moment ${index + 1}.`,
        cropIntents: [{ photoId: photo.id, region: "center" as const }],
        id: `spread-${index + 1}`,
        photoIds: [photo.id],
        photoRoles: [{ photoId: photo.id, role: "hero" as const }],
        rationale: "Planner chose a sparse rhythm.",
        storyBeat: index === 0 ? "opener" : "highlight",
        templateId: "hero-1",
        title: `Moment ${index + 1}`,
      })),
      summary: "Sparse planner output.",
      warnings: [],
    });

    const usedPhotoIds = new Set(generated.bookDraft.pages.flatMap((page) => page.photoIds));
    expect(usedPhotoIds.size).toBeGreaterThanOrEqual(Math.ceil(project.photos.length * 0.85));
    expect(generated.bookDraft.pages.length).toBeLessThanOrEqual(8);
  });

  it("fills underused sparse spreads when the AI already returned eight pages", () => {
    const project = addPhotosToProject(
      createProjectRecord({
        endDate: "2026-07-14",
        ownerEmail: "owner@example.com",
        ownerName: "Owner",
        startDate: "2026-07-11",
        subtitle: "Dominican Republic",
        timezone: "America/Denver",
        title: "Cap Cana 2026 Trip",
        type: "trip",
      }),
      Array.from({ length: 13 }, (_, index) => ({
        capturedAt: `2026-07-${String(11 + (index % 4)).padStart(2, "0")}T12:00:00.000Z`,
        height: index % 2 === 0 ? 1800 : 2400,
        locationConfidence: "exact" as const,
        locationLabel: "Cap Cana",
        title: `Cap Cana sparse photo ${index + 1}`,
        uploaderId: "owner",
        uri: `https://example.com/cap-cana-sparse-${index + 1}.jpg`,
        width: index % 2 === 0 ? 2400 : 1800,
      })),
    );
    const generated = materializeAiBookPlan(project, {
      chapters: [{ id: "chapter-1", title: "Cap Cana", spreadIds: [] }],
      designScore: 80,
      spreadPlans: project.photos.slice(0, 8).map((photo, index) => ({
        caption: `Cap Cana sparse moment ${index + 1}.`,
        cropIntents: [{ photoId: photo.id, region: "center" as const }],
        id: `spread-${index + 1}`,
        photoIds: [photo.id],
        photoRoles: [{ photoId: photo.id, role: "hero" as const }],
        rationale: "Planner returned an underfilled spread.",
        storyBeat: index === 0 ? "opener" : "highlight",
        templateId: "hero-1",
        title: `Sparse moment ${index + 1}`,
      })),
      summary: "Sparse eight-page planner output.",
      warnings: [],
    });

    const usedPhotoIds = new Set(generated.bookDraft.pages.flatMap((page) => page.photoIds));
    const hasDetailGrid = generated.bookDraft.pages.some((page) =>
      page.storyBeat === "details" || /grid/.test(page.templateId ?? ""),
    );

    expect(generated.bookDraft.pages).toHaveLength(8);
    expect(usedPhotoIds.size).toBeGreaterThanOrEqual(Math.ceil(project.photos.length * 0.85));
    expect(hasDetailGrid).toBe(true);
  });

  it("scales larger trip uploads into a fuller coffee-table book instead of eight sparse pages", () => {
    const project = addPhotosToProject(
      createProjectRecord({
        endDate: "2026-07-14",
        ownerEmail: "owner@example.com",
        ownerName: "Owner",
        startDate: "2026-07-11",
        subtitle: "Dominican Republic",
        timezone: "America/Denver",
        title: "Cap Cana 2026 Trip",
        type: "trip",
      }),
      Array.from({ length: 60 }, (_, index) => ({
        capturedAt: `2026-07-${String(11 + (index % 4)).padStart(2, "0")}T12:00:00.000Z`,
        height: index % 2 === 0 ? 1800 : 2400,
        locationConfidence: "exact" as const,
        locationLabel: index % 5 === 0 ? "Cap Cana marina" : "Cap Cana",
        title: `Cap Cana book photo ${index + 1}`,
        uploaderId: "owner",
        uri: `https://example.com/cap-cana-book-${index + 1}.jpg`,
        width: index % 2 === 0 ? 2400 : 1800,
      })),
    );
    const generated = materializeAiBookPlan(project, {
      chapters: [{ id: "chapter-1", title: "Cap Cana", spreadIds: [] }],
      designScore: 82,
      spreadPlans: project.photos.slice(0, 8).map((photo, index) => ({
        caption: `Cap Cana large-trip moment ${index + 1}.`,
        cropIntents: [{ photoId: photo.id, region: "center" as const }],
        id: `spread-${index + 1}`,
        photoIds: [photo.id],
        photoRoles: [{ photoId: photo.id, role: "hero" as const }],
        rationale: "Planner chose a sparse rhythm.",
        storyBeat: index === 0 ? "opener" : "highlight",
        templateId: "hero-1",
        title: `Large moment ${index + 1}`,
      })),
      summary: "Sparse large-trip planner output.",
      warnings: [],
    });

    const usedPhotoIds = new Set(generated.bookDraft.pages.flatMap((page) => page.photoIds));
    expect(generated.bookDraft.pages.length).toBeGreaterThanOrEqual(10);
    expect(generated.bookDraft.pages.length).toBeLessThanOrEqual(12);
    expect(usedPhotoIds.size).toBeGreaterThanOrEqual(Math.ceil(project.photos.length * 0.35));
    expect(generated.bookDraft.pages.at(-1)?.storyBeat).toBe("closing");
    expect(generated.bookDraft.pages.map((page) => page.caption).join(" ")).not.toMatch(
      /\b(?:DSC|IMG|PXL|jpe?g|png|heic|webp)\b|\(\d{2,}/i,
    );
  });

  it("normalizes generated summaries to the repaired spread and photo counts", () => {
    const project = createProjectWithPhotos();
    const firstPhoto = project.photos[0]!;
    const generated = materializeAiBookPlan(project, {
      chapters: [{ id: "chapter-1", title: "Counts", spreadIds: ["spread-1"] }],
      designScore: 90,
      spreadPlans: [
        {
          caption: "Cap Cana begins with one quiet frame.",
          cropIntents: [{ photoId: firstPhoto.id, region: "center" }],
          id: "spread-1",
          photoIds: [firstPhoto.id],
          photoRoles: [{ photoId: firstPhoto.id, role: "hero" }],
          rationale: "Planner started too sparse.",
          storyBeat: "opener",
          templateId: "hero-1",
          title: "Opening frame",
        },
      ],
      summary: "This generated book includes 8 spreads from 13 approved photos.",
      warnings: [],
    });

    expect(generated.bookDraft.pages).toHaveLength(4);
    expect(generated.bookDraft.summary).toContain("4 spreads");
    expect(generated.bookDraft.summary).toContain("6 approved photos");
    expect(generated.bookDraft.summary).not.toContain("8 spreads");
    expect(generated.bookDraft.summary).not.toContain("13 approved photos");
  });

  it("preserves locked pages and confirmed manual copy during AI materialization", () => {
    const project = createProjectWithPhotos();
    const lockedPage = {
      ...project.bookDraft.pages[0]!,
      title: "Manual title",
      caption: "Manual confirmed caption.",
      copySource: "manual" as const,
      copyStatus: "confirmed" as const,
      approved: true,
    };
    const lockedProject = {
      ...project,
      bookDraft: {
        ...project.bookDraft,
        pages: [lockedPage, ...project.bookDraft.pages.slice(1)],
      },
      draftEditorState: {
        ...project.draftEditorState!,
        lockedPageIds: [lockedPage.id],
      },
    };

    const generated = materializeAiBookPlan(lockedProject, {
      chapters: [{ id: "chapter-1", title: "Locked", spreadIds: ["spread-1"] }],
      designScore: 82,
      spreadPlans: [
        {
          caption: "AI replacement caption.",
          cropIntents: [],
          id: "spread-1",
          photoIds: lockedPage.photoIds,
          photoRoles: [],
          rationale: "Planner wants to replace it.",
          storyBeat: lockedPage.storyBeat,
          templateId: lockedPage.templateId ?? "full-bleed-1",
          title: "AI replacement title",
        },
      ],
      summary: "Locked page test.",
      warnings: [],
    });

    expect(generated.bookDraft.pages[0]?.id).toBe(lockedPage.id);
    expect(generated.bookDraft.pages[0]?.title).toBe("Manual title");
    expect(generated.bookDraft.pages[0]?.caption).toBe("Manual confirmed caption.");
    expect(generated.bookDraft.pages[0]?.approved).toBe(true);
  });

  it("scores generated drafts and attaches the quality report to saved runs", () => {
    const project = createProjectWithPhotos();
    const firstPhoto = project.photos[0]!;
    const generated = materializeAiBookPlan(
      project,
      {
        chapters: [{ id: "chapter-1", title: "Cap Cana", spreadIds: ["spread-1"] }],
        designScore: 82,
        spreadPlans: [
          {
            caption: "Cap Cana gives the book a bright trip opener.",
            cropIntents: [{ photoId: firstPhoto.id, region: "center" }],
            id: "spread-1",
            photoIds: [firstPhoto.id],
            photoRoles: [{ photoId: firstPhoto.id, role: "hero" }],
            rationale: "A clean opener.",
            storyBeat: "opener",
            templateId: "full-bleed-1",
            title: "Cap Cana arrival",
          },
        ],
        summary: "Cap Cana draft.",
        warnings: [],
      },
      {
        run: {
          id: "run-quality",
          modelNames: {
            planner: "qwen3:14b",
            vision: "qwen2.5vl:7b",
          },
          progress: ["generation requested"],
          startedAt: "2026-07-11T12:00:00.000Z",
          status: "validating",
          validationWarnings: [],
        },
      },
    );
    const qualityReport = scoreGeneratedBook(generated);

    expect(generated.generationRuns?.[0]?.id).toBe("run-quality");
    expect(generated.generationRuns?.[0]?.qualityReport?.score).toBe(qualityReport.score);
    expect(generated.generationRuns?.[0]?.status).toBe("saved");
    expect(qualityReport.unsupportedTemplateIds).toEqual([]);
  });

  it("upserts and fails generation runs without duplicating run history", () => {
    const project = createProjectWithPhotos();
    const queuedProject = upsertGenerationRun(project, {
      id: "run-1",
      modelNames: {
        planner: "qwen3:14b",
        vision: "qwen2.5vl:7b",
      },
      progress: ["queued"],
      startedAt: "2026-07-11T12:00:00.000Z",
      status: "queued",
      validationWarnings: [],
    });
    const planningProject = upsertGenerationRun(queuedProject, {
      ...queuedProject.generationRuns![0]!,
      progress: ["queued", "planning"],
      status: "planning",
    });
    const failedProject = markGenerationRunFailed(
      planningProject,
      "run-1",
      "The project changed while local AI was running.",
    );

    expect(planningProject.generationRuns).toHaveLength(1);
    expect(failedProject.generationRuns?.[0]?.status).toBe("failed");
    expect(failedProject.generationRuns?.[0]?.errorMessage).toContain("project changed");
    expect(failedProject.generationRuns?.[0]?.validationWarnings).toContain(
      "The project changed while local AI was running.",
    );
  });
});
