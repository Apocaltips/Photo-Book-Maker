"use client";

import {
  type AddLocalPhotoInput,
  type BookMakingGuide,
  type BookGenerationQuestionnaireAnswers,
  type GenerationRun,
  type Project,
  buildBookGenerationQuestionnaire,
  formatProjectRange,
  getBookMakingGuide,
  getProjectSummary,
  getYearbookCycleLabel,
} from "@photo-book-maker/core";
import type { ChangeEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import { StatusPill } from "@/components/status-pill";
import { WorkspaceAuthCard } from "@/components/workspace-auth-card";
import { useProjectWorkspace } from "@/hooks/use-project-workspace";
import { DEV_AUTH_ID, getDevAuthHeaders } from "@/lib/dev-auth";

type UploadProgress = {
  failedFileNames: string[];
  currentFile?: string;
  total: number;
  uploaded: number;
};

export function ProjectProofBoardClient({
  authConfig,
  projectId,
}: {
  authConfig: { supabaseAnonKey: string; supabaseUrl: string };
  projectId: string;
}) {
  const workspace = useProjectWorkspace({
    authConfig,
    projectId,
  });
  const [boardMessage, setBoardMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [inviteName, setInviteName] = useState("New collaborator");
  const [inviteEmail, setInviteEmail] = useState("");
  const [noteTitle, setNoteTitle] = useState("Trip note");
  const [noteBody, setNoteBody] = useState("");
  const [taskLocations, setTaskLocations] = useState<Record<string, string>>({});
  const [aiAnswers, setAiAnswers] = useState<Partial<BookGenerationQuestionnaireAnswers>>({});
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [lastGenerationRun, setLastGenerationRun] = useState<GenerationRun | null>(null);
  const authHeaders = workspace.session?.access_token
    ? { Authorization: `Bearer ${workspace.session.access_token}` }
    : getDevAuthHeaders();

  async function requestProjectMutation(path: string, init: RequestInit) {
    if (!workspace.project) {
      throw new Error("Open a project before updating this shared book.");
    }

    const body =
      typeof init.body === "string"
        ? JSON.stringify({
            ...JSON.parse(init.body),
            expectedRevision: workspace.project.revision,
          })
        : init.body;
    const response = await fetch(path, {
      ...init,
      body,
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const payload = (await response.json().catch(() => ({}))) as { message?: string };

    if (!response.ok) {
      throw new Error(payload.message || "The project update failed.");
    }

    await workspace.refreshProject?.();
    return payload;
  }

  async function getImageDimensions(file: File) {
    const objectUrl = URL.createObjectURL(file);

    try {
      return await new Promise<{ height: number; width: number }>((resolve) => {
        const image = new Image();
        image.onload = () =>
          resolve({
            height: image.naturalHeight || 1200,
            width: image.naturalWidth || 1600,
          });
        image.onerror = () => resolve({ height: 1200, width: 1600 });
        image.src = objectUrl;
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function handlePhotoUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (!files.length || !workspace.project) {
      return;
    }

    setIsUploading(true);
    setBoardMessage(null);
    setUploadProgress({
      currentFile: files[0]?.name,
      failedFileNames: [],
      total: files.length,
      uploaded: 0,
    });

    try {
      const photos: AddLocalPhotoInput[] = [];
      const failedFileNames: string[] = [];

      for (const [index, file] of files.entries()) {
        setUploadProgress({
          currentFile: file.name,
          failedFileNames: [...failedFileNames],
          total: files.length,
          uploaded: photos.length,
        });

        try {
          const ticketResponse = await fetch(`/api/projects/${workspace.project.id}/uploads`, {
            method: "POST",
            headers: {
              ...authHeaders,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contentType: file.type || "image/jpeg",
              fileName: file.name || `web-upload-${Date.now()}-${index}.jpg`,
            }),
          });
          const ticketBody = (await ticketResponse.json()) as {
            message?: string;
            upload?: {
              downloadUrl: string;
              storagePath: string;
              uploadUrl: string;
            };
          };

          if (!ticketResponse.ok || !ticketBody.upload) {
            throw new Error(ticketBody.message || `Upload ticket failed for ${file.name}.`);
          }

          const uploadResponse = await fetch(ticketBody.upload.uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Type": file.type || "image/jpeg",
            },
            body: file,
          });

          if (!uploadResponse.ok) {
            throw new Error(`Remote upload failed for ${file.name}.`);
          }

          const dimensions = await getImageDimensions(file);
          photos.push({
            capturedAt: new Date(file.lastModified || Date.now()).toISOString(),
            height: dimensions.height,
            locationConfidence: "missing",
            mimeType: file.type || "image/jpeg",
            qualityNotes: ["Uploaded from web.", "Waiting on location confirmation."],
            storagePath: ticketBody.upload.storagePath,
            title: file.name.replace(/\.[^.]+$/, "") || `Web upload ${index + 1}`,
            uploaderId: workspace.session?.user.id ?? DEV_AUTH_ID,
            uri: ticketBody.upload.downloadUrl,
            width: dimensions.width,
          });
        } catch {
          failedFileNames.push(file.name || `photo ${index + 1}`);
        } finally {
          setUploadProgress({
            currentFile: files[index + 1]?.name,
            failedFileNames: [...failedFileNames],
            total: files.length,
            uploaded: photos.length,
          });
        }
      }

      if (!photos.length) {
        throw new Error(
          failedFileNames.length
            ? `No photos uploaded. Try those files again: ${failedFileNames.slice(0, 3).join(", ")}.`
            : "No photos uploaded. Try choosing the photos again.",
        );
      }

      await requestProjectMutation(`/api/projects/${workspace.project.id}/photos`, {
        method: "POST",
        body: JSON.stringify({ photos }),
      });
      setBoardMessage(
        failedFileNames.length
          ? `Added ${photos.length} photo${photos.length === 1 ? "" : "s"}. ${failedFileNames.length} file${failedFileNames.length === 1 ? "" : "s"} did not finish and can be chosen again.`
          : `Added ${photos.length} photo${photos.length === 1 ? "" : "s"}. Next: make the first book draft.`,
      );
    } catch (caughtError) {
      const fallback =
        "I could not add those photos. Try again, or choose fewer photos at once.";
      setBoardMessage(
        caughtError instanceof Error ? `${fallback} ${caughtError.message}` : fallback,
      );
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  }

  async function handleAddNote() {
    if (!workspace.project || !noteTitle.trim() || !noteBody.trim()) {
      return;
    }

    try {
      await requestProjectMutation(`/api/projects/${workspace.project.id}/notes`, {
        method: "POST",
        body: JSON.stringify({
          authorId: workspace.session?.user.id ?? workspace.project.ownerId,
          body: noteBody.trim(),
          title: noteTitle.trim(),
        }),
      });
      setBoardMessage("Saved this story note for the book.");
      setNoteBody("");
    } catch (caughtError) {
      setBoardMessage(
        caughtError instanceof Error ? caughtError.message : "The note could not be saved.",
      );
    }
  }

  async function handleInviteCollaborator() {
    if (!workspace.project || !inviteName.trim() || !inviteEmail.trim()) {
      return;
    }

    try {
      await requestProjectMutation(`/api/projects/${workspace.project.id}/collaborators`, {
        method: "POST",
        body: JSON.stringify({
          email: inviteEmail.trim(),
          name: inviteName.trim(),
        }),
      });
      setBoardMessage(`Invite ready for ${inviteEmail.trim()}.`);
      setInviteName("New collaborator");
      setInviteEmail("");
    } catch (caughtError) {
      setBoardMessage(
        caughtError instanceof Error
          ? caughtError.message
          : "The collaborator invite could not be created.",
      );
    }
  }

  async function handleToggleMustInclude(photoId: string) {
    if (!workspace.project) {
      return;
    }

    try {
      await requestProjectMutation(
        `/api/projects/${workspace.project.id}/photos/${photoId}/must-include`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      setBoardMessage("Photo choice saved.");
    } catch (caughtError) {
      setBoardMessage(
        caughtError instanceof Error ? caughtError.message : "The photo update failed.",
      );
    }
  }

  async function handleResolveTask(taskId: string) {
    if (!workspace.project) {
      return;
    }

    try {
      await requestProjectMutation(
        `/api/projects/${workspace.project.id}/tasks/${taskId}/resolve`,
        {
          method: "POST",
          body: JSON.stringify({
            locationLabel: taskLocations[taskId]?.trim(),
            status: "resolved",
          }),
        },
      );
      setBoardMessage("Marked fixed.");
    } catch (caughtError) {
      setBoardMessage(
        caughtError instanceof Error ? caughtError.message : "The blocker update failed.",
      );
    }
  }

  async function handleFinalizeProject() {
    if (!workspace.project) {
      return;
    }

    try {
      await requestProjectMutation(`/api/projects/${workspace.project.id}/finalize`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setBoardMessage("Print readiness check complete.");
    } catch (caughtError) {
      setBoardMessage(
        caughtError instanceof Error ? caughtError.message : "The print readiness check failed.",
      );
    }
  }

  async function handleGenerateAiBook() {
    if (!workspace.project) {
      return;
    }

    setIsAiGenerating(true);
    setBoardMessage(
      "Making your book now. This can take a few minutes while local AI reviews photos, picks layouts, and writes captions.",
    );
    setLastGenerationRun(null);

    try {
      const defaults = buildBookGenerationQuestionnaire(workspace.project).answers;
      const result = await workspace.generateAiBook({
        questionnaire: {
          ...defaults,
          ...aiAnswers,
        },
      });
      setLastGenerationRun(result.run ?? null);
      setBoardMessage(
        `Your book draft is ready: ${result.project.bookDraft.pages.length} spreads saved. Review it, then save the PDF when it looks right.`,
      );
    } catch (caughtError) {
      const fallback = "The book could not be made yet.";
      setBoardMessage(
        caughtError instanceof Error
          ? `${fallback} ${caughtError.message}`
          : `${fallback} Please try again after checking the photos.`,
      );
    } finally {
      setIsAiGenerating(false);
    }
  }

  if (workspace.isAuthLoading || workspace.isProjectLoading) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-5 py-6 md:px-8 lg:px-10">
        <section className="surface-strong rounded-[2.5rem] px-6 py-8 md:px-10 md:py-10">
          <div className="eyebrow">Project workspace</div>
          <h1 className="display mt-3 text-5xl leading-none text-[#1f1814] sm:text-6xl">
            Loading project...
          </h1>
        </section>
      </main>
    );
  }

  if (!workspace.project) {
    return (
      <main className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-8 px-5 py-6 md:px-8 lg:px-10">
        <WorkspaceAuthCard
          isConfigured={Boolean(authConfig.supabaseUrl && authConfig.supabaseAnonKey)}
          onSignIn={workspace.signIn}
          onSignUp={workspace.signUp}
        />
      </main>
    );
  }

  const project = workspace.project;
  const summary = getProjectSummary(project);
  const bookGuide = getBookMakingGuide(project);
  const selectedTheme =
    project.bookThemes.find((theme) => theme.id === project.selectedThemeId) ??
    project.bookThemes[0];
  const aiQuestionnaire = buildBookGenerationQuestionnaire(project);
  const resolvedAiAnswers = {
    ...aiQuestionnaire.answers,
    ...aiAnswers,
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-5 py-6 md:px-8 lg:px-10">
      <section className="surface-strong rounded-[2.5rem] px-6 py-8 md:px-10 md:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="eyebrow">Photo book workspace</div>
            <h1 className="display mt-3 text-4xl leading-tight text-[#1f1814] sm:text-6xl sm:leading-none">
              {project.title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-[#5a4e47] md:text-lg">
              {project.subtitle}
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 lg:items-end">
            <StatusPill status={project.status} />
            <div className="text-sm text-[#635851]">
              {formatProjectRange(project)} in {project.timezone}
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/projects/${project.id}/preview`}
                className="rounded-full border border-[#1f18141f] bg-white/70 px-4 py-2 text-sm font-medium text-[#1f1814] transition-colors hover:bg-white"
              >
                Review book
              </Link>
              <Link
                href={`/projects/${project.id}/proof`}
                className="rounded-full border border-[#1f18141f] bg-[#2e5c4d] px-4 py-2 text-sm font-medium text-[#f8efe7] transition-colors hover:bg-[#23483d]"
                style={{ color: "#f8efe7" }}
              >
                Save/print PDF
              </Link>
              <Link
                href={`/projects/${project.id}/editor`}
                className="rounded-full border border-[#1f18141f] bg-[#1f1814] px-4 py-2 text-sm font-medium text-[#f8efe7] transition-colors hover:bg-[#302721]"
                style={{ color: "#f8efe7" }}
              >
                Edit pages
              </Link>
              {workspace.mode === "authenticated" ? (
                <button
                  type="button"
                  onClick={() => workspace.signOut()}
                  className="rounded-full border border-[#1f18141f] bg-white/75 px-4 py-2 text-sm font-medium text-[#1f1814] transition-colors hover:bg-white"
                >
                  Sign out
                </button>
              ) : null}
            </div>
            {project.type === "yearbook" && project.yearbookCycle ? (
              <div className="text-xs uppercase tracking-[0.18em] text-[#7b6f67]">
                {getYearbookCycleLabel(project.yearbookCycle)}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Metric label="Photos ready" value={summary.approvedPhotos} />
          <Metric label="Favorites" value={summary.mustIncludePhotos} />
          <Metric label="Fix before print" value={summary.openTasks} />
          <Metric label="Book spreads" value={summary.pageCount} />
        </div>
      </section>

      <WorkflowGuide
        guide={bookGuide}
        isAiGenerating={isAiGenerating}
        isUploading={isUploading}
        projectId={project.id}
      />

      {boardMessage ? (
        <section
          aria-live="polite"
          role="status"
          className="rounded-[1.8rem] border border-[#d9c7b9] bg-[#fff8f2] px-5 py-4 text-sm leading-7 text-[#6d5544]"
        >
          {boardMessage}
        </section>
      ) : null}

      <section className="grid min-w-0 gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="surface order-2 min-w-0 rounded-[2rem] p-6 lg:order-1">
          <div className="eyebrow">Your book draft</div>
          <h2 className="display mt-2 text-3xl text-[#1f1814]">Review the book AI made</h2>
          <p className="mt-3 text-sm leading-7 text-[#5b4f47]">
            {project.bookDraft.summary ||
              "Add photos and make a book to see the first spreads here."}
          </p>

          <div className="mt-6 grid min-w-0 gap-4 sm:grid-cols-2">
            {project.bookDraft.pages.length ? (
              project.bookDraft.pages.map((page, index) => (
                <div
                  key={page.id}
                  className="min-w-0 rounded-[1.6rem] border border-[#00000012] bg-white/74 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.18em] text-[#7d7067]">
                      Spread {index + 1}
                    </span>
                    <span className="rounded-full bg-[#f1ebe4] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6f625b]">
                      {page.style.replaceAll("_", " ")}
                    </span>
                  </div>
                  <div className="mt-3 break-words text-xl font-semibold text-[#211a16]">
                    {page.title}
                  </div>
                  <p className="mt-2 break-words text-sm leading-7 text-[#5d524b]">
                    {page.caption}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-[1.4rem] border border-dashed border-[#00000014] px-4 py-5 text-sm leading-7 text-[#6f625b] sm:col-span-2">
                No book spreads yet. Add photos, then choose "Make my book."
              </div>
            )}
          </div>
        </section>

        <div className="order-1 min-w-0 space-y-6 lg:order-2">
          <section id="add-photos" className="surface min-w-0 rounded-[2rem] p-6">
            <div className="eyebrow">Step 1</div>
            <h2 className="display mt-2 text-3xl text-[#1f1814]">Add trip photos</h2>
            <p className="mt-3 text-sm leading-7 text-[#5b4f47]">
              Choose photos from your computer or phone. You can select many at once.
              The app copies them into this shared book and never deletes your originals.
            </p>
            <label className="mt-5 flex cursor-pointer items-center justify-center rounded-[1.4rem] border border-dashed border-[#1f181433] bg-white/70 px-5 py-5 text-sm font-semibold text-[#1f1814] transition-colors hover:bg-white">
              {isUploading ? "Adding photos..." : "Choose photos"}
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={isUploading}
                onChange={handlePhotoUpload}
                className="sr-only"
              />
            </label>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Metric label="Photos in book" value={project.photos.length} />
              <Metric label="Photos ready" value={summary.approvedPhotos} />
            </div>
            {uploadProgress ? (
              <div className="mt-4 rounded-[1.3rem] border border-[#00000012] bg-white/72 px-4 py-4 text-sm leading-6 text-[#5b4f47]">
                <div className="font-semibold text-[#1f1814]">
                  Added {uploadProgress.uploaded} of {uploadProgress.total}
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#ece2d8]">
                  <div
                    className="h-full rounded-full bg-[#2e5c4d]"
                    style={{
                      width: `${Math.round(
                        ((uploadProgress.uploaded + uploadProgress.failedFileNames.length) /
                          Math.max(uploadProgress.total, 1)) *
                          100,
                      )}%`,
                    }}
                  />
                </div>
                {uploadProgress.failedFileNames.length ? (
                  <p className="mt-3 text-[#8d4f33]">
                    {uploadProgress.failedFileNames.length} file
                    {uploadProgress.failedFileNames.length === 1 ? "" : "s"} did not finish.
                    Choose them again after this batch completes.
                  </p>
                ) : null}
                {uploadProgress.currentFile ? (
                  <p className="mt-3 truncate text-xs text-[#7b6f67]">
                    Now adding: {uploadProgress.currentFile}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-[#7b6f67]">
                  Keep this page open until it finishes.
                </p>
              </div>
            ) : null}
          </section>

          <AiDesignerPanel
            answers={resolvedAiAnswers}
            isGenerating={isAiGenerating}
            lastRun={lastGenerationRun ?? project.generationRuns?.[0] ?? null}
            onAnswerChange={(key, value) =>
              setAiAnswers((current) => ({
                ...current,
                [key]: value,
              }))
            }
            onGenerate={() => void handleGenerateAiBook()}
            project={project}
          />

          <section className="surface min-w-0 rounded-[2rem] p-6">
            <div className="eyebrow">Collaborators</div>
            <h2 className="display mt-2 text-3xl text-[#1f1814]">Invite a partner</h2>
            <div className="mt-5 space-y-3">
              <input
                type="text"
                value={inviteName}
                onChange={(event) => setInviteName(event.target.value)}
                placeholder="Name"
                className="w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
              />
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="email@example.com"
                className="w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
              />
              <button
                type="button"
                onClick={() => void handleInviteCollaborator()}
                className="rounded-full border border-[#1f18141f] bg-[#1f1814] px-4 py-2 text-sm font-medium text-[#f8efe7]"
              >
                Send invite
              </button>
            </div>
            <div className="mt-5 grid gap-2">
              {project.members.map((member) => (
                <div
                  key={member.id}
                  className="rounded-[1rem] border border-[#00000010] bg-white/70 px-3 py-2"
                >
                  <div className="font-medium text-[#1f1814]">{member.name}</div>
                  <div className="text-xs text-[#6f625b]">{member.email}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="surface min-w-0 rounded-[2rem] p-6">
            <div className="eyebrow">Memory note</div>
            <h2 className="display mt-2 text-3xl text-[#1f1814]">Add story context</h2>
            <div className="mt-5 space-y-3">
              <input
                type="text"
                value={noteTitle}
                onChange={(event) => setNoteTitle(event.target.value)}
                className="w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
              />
              <textarea
                rows={4}
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
                placeholder="What should the book remember about this part of the trip?"
                className="w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm leading-7 text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
              />
              <button
                type="button"
                onClick={() => void handleAddNote()}
                className="rounded-full border border-[#1f18141f] bg-[#1f1814] px-4 py-2 text-sm font-medium text-[#f8efe7]"
              >
                Save note
              </button>
            </div>
          </section>

          <section className="surface min-w-0 rounded-[2rem] p-6">
            <div className="eyebrow">Saved book versions</div>
            <h2 className="display mt-2 text-3xl text-[#1f1814]">Saved versions</h2>
            <div className="mt-5 space-y-3">
              {project.publishedDrafts?.length ? (
                project.publishedDrafts.map((draft) => (
                  <Link
                    key={draft.id}
                    href={`/projects/${project.id}/preview?draft=${draft.id}`}
                    className="block rounded-[1.4rem] border border-[#00000012] bg-white/74 px-4 py-4 transition-colors hover:bg-white"
                  >
                    <div className="font-medium text-[#1f1814]">{draft.name}</div>
                    <div className="mt-2 text-xs uppercase tracking-[0.16em] text-[#7b6f67]">
                      {new Date(draft.savedAt).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </div>
                  </Link>
                ))
              ) : (
                <div className="rounded-[1.4rem] border border-dashed border-[#00000014] px-4 py-5 text-sm leading-7 text-[#6f625b]">
                  Save a named version from the editor when you want to compare two book drafts.
                </div>
              )}
            </div>
          </section>

          <section className="surface min-w-0 rounded-[2rem] p-6">
            <div className="eyebrow">Final step</div>
            <h2 className="display mt-2 text-3xl text-[#1f1814]">{selectedTheme.name}</h2>
            <p className="mt-3 text-sm leading-7 text-[#5b4f47]">
              {selectedTheme.mood}. Typography: {selectedTheme.typeface}.
            </p>
            <div className="mt-5 rounded-[1.6rem] bg-[#1f1814] p-5 text-[#f6eee7]">
              <div className="text-xs uppercase tracking-[0.18em] text-[#d8bea8]">
                Ready for PDF
              </div>
              <div className="mt-3 text-2xl font-semibold capitalize">
                {project.status.replaceAll("_", " ")}
              </div>
              <div className="mt-4 grid gap-3 text-sm text-[#eadfd4]">
                <div className="flex items-center justify-between gap-3">
                  <span>Approved pages</span>
                  <span>{project.bookDraft.pages.filter((page) => page.approved).length}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Items to fix</span>
                  <span>{summary.openTasks}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Proof PDF</span>
                  <span>Web or phone</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleFinalizeProject()}
              className="mt-4 w-full rounded-full border border-[#1f18141f] bg-[#2e5c4d] px-4 py-2 text-sm font-medium text-[#f8efe7]"
            >
              Check if book is ready
            </button>
            <Link
              href={`/projects/${project.id}/proof`}
              className="mt-3 flex w-full items-center justify-center rounded-full border border-[#1f18141f] bg-white/80 px-4 py-2 text-sm font-medium text-[#1f1814] transition-colors hover:bg-white"
            >
              Save/print PDF
            </Link>
          </section>

          <section className="surface min-w-0 rounded-[2rem] p-6">
            <div className="eyebrow">Favorites</div>
            <h2 className="display mt-2 text-3xl text-[#1f1814]">
              Photos you really want included
            </h2>
            <div className="mt-5 grid min-w-0 gap-3">
              {project.photos.slice(0, 12).map((photo) => (
                <div
                  key={photo.id}
                  className="min-w-0 rounded-[1.3rem] border border-[#00000012] bg-white/74 p-3"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    {photo.imageUri ? (
                      <img
                        src={photo.imageUri}
                        alt={photo.title}
                        className="h-16 w-16 shrink-0 rounded-[0.9rem] object-cover"
                      />
                    ) : (
                      <div className="h-16 w-16 shrink-0 rounded-[0.9rem] bg-[#eadfd4]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-[#1f1814]">{photo.title}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.14em] text-[#7b6f67]">
                        {photo.locationLabel ?? "Location pending"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleToggleMustInclude(photo.id)}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                        photo.mustInclude
                          ? "bg-[#2e5c4d] text-[#f8efe7]"
                          : "border border-[#00000012] bg-white text-[#1f1814]"
                      }`}
                    >
                      {photo.mustInclude ? "Included" : "Keep in book"}
                    </button>
                  </div>
                </div>
              ))}
              {!project.photos.length ? (
                <div className="rounded-[1.4rem] border border-dashed border-[#00000014] px-4 py-5 text-sm leading-7 text-[#6f625b]">
                  Add photos first, then mark the ones the book must use.
                </div>
              ) : null}
            </div>
          </section>

          <section className="surface min-w-0 rounded-[2rem] p-6">
            <div className="eyebrow">Before printing</div>
            <h2 className="display mt-2 text-3xl text-[#1f1814]">
              Things to fix before printing
            </h2>
            <div className="mt-5 space-y-3">
              {project.resolutionTasks
                .filter((task) => task.status !== "resolved")
                .map((task) => (
                  <div
                    key={task.id}
                    className="rounded-[1.4rem] border border-[#00000012] bg-white/74 px-4 py-4"
                  >
                    <div className="text-xs uppercase tracking-[0.18em] text-[#8d4f33]">
                      {task.type}
                    </div>
                    <h3 className="mt-2 text-lg font-semibold text-[#221b17]">{task.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-[#5e534b]">{task.detail}</p>
                    {task.type === "location" ? (
                      <input
                        type="text"
                        value={taskLocations[task.id] ?? ""}
                        onChange={(event) =>
                          setTaskLocations((current) => ({
                            ...current,
                            [task.id]: event.target.value,
                          }))
                        }
                        placeholder="Confirmed location"
                        className="mt-3 w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleResolveTask(task.id)}
                      className="mt-3 rounded-full border border-[#1f18141f] bg-[#1f1814] px-4 py-2 text-sm font-medium text-[#f8efe7]"
                    >
                      Mark fixed
                    </button>
                  </div>
                ))}
              {!project.resolutionTasks.some((task) => task.status !== "resolved") ? (
                <p className="text-sm text-[#5e534b]">
                  Nothing to fix. This book can move to PDF review.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function WorkflowGuide({
  guide,
  isAiGenerating,
  isUploading,
  projectId,
}: {
  guide: BookMakingGuide;
  isAiGenerating: boolean;
  isUploading: boolean;
  projectId: string;
}) {
  const hrefForStep: Record<BookMakingGuide["currentStepId"], string> = {
    design: "#ai-designer",
    print: `/projects/${projectId}/proof`,
    review: `/projects/${projectId}/editor`,
    upload: "#add-photos",
  };

  return (
    <section className="surface min-w-0 rounded-[2rem] p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="eyebrow">Easy path</div>
          <h2 className="display mt-2 text-3xl text-[#1f1814]">
            Next: {guide.nextActionLabel}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-[#5b4f47]">
            {guide.nextStepDetail}
          </p>
        </div>
        <a
          href={hrefForStep[guide.currentStepId]}
          className="inline-flex items-center justify-center rounded-full border border-[#1f18141f] bg-[#1f1814] px-5 py-3 text-sm font-semibold text-[#f8efe7] transition-colors hover:bg-[#302721]"
          style={{ color: "#f8efe7" }}
        >
          {isUploading
            ? "Uploading photos..."
            : isAiGenerating
              ? "Generating book..."
              : guide.nextActionLabel}
        </a>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {guide.steps.map((step, index) => (
          <WorkflowStep
            key={step.id}
            action={step.actionLabel}
            href={hrefForStep[step.id]}
            label={`${index + 1}`}
            status={
              step.id === "upload" && isUploading
                ? "Uploading"
                : step.id === "design" && isAiGenerating
                  ? "Working"
                  : getStepStatusLabel(step.status)
            }
            title={step.label.replace(/^\d+\.\s*/, "")}
            value={step.detail}
          />
        ))}
      </div>
    </section>
  );
}

function getStepStatusLabel(status: BookMakingGuide["steps"][number]["status"]) {
  switch (status) {
    case "blocked":
      return "Needs fix";
    case "current":
      return "Do this";
    case "done":
      return "Done";
    case "waiting":
      return "Waiting";
  }
}

function formatGenerationProgress(progress: string[]) {
  return progress
    .slice(-3)
    .map((step) => step.replaceAll("_", " "))
    .join(" / ");
}

function formatGenerationStatus(status: GenerationRun["status"]) {
  if (status === "saved") {
    return "saved";
  }

  return status.replaceAll("_", " ");
}

function formatGenerationWarning(warning: string) {
  if (warning.includes("qwen3:14b") || warning.includes("fetch failed")) {
    return "The largest local model was too slow here, so the backup model finished the book plan.";
  }

  return warning;
}

function WorkflowStep({
  action,
  href,
  label,
  status,
  title,
  value,
}: {
  action: string;
  href: string;
  label: string;
  status: string;
  title: string;
  value: string;
}) {
  const isHashLink = href.startsWith("#");
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1f1814] text-sm font-semibold text-[#f8efe7]">
          {label}
        </span>
        <span className="rounded-full bg-white/78 px-3 py-1 text-xs font-semibold text-[#5f544d]">
          {status}
        </span>
      </div>
      <div>
        <div className="mt-4 text-xl font-semibold text-[#1f1814]">{title}</div>
        <div className="mt-1 text-sm text-[#62574f]">{value}</div>
      </div>
      <div className="mt-4 text-sm font-semibold text-[#8d4f33]">{action}</div>
    </>
  );

  const className =
    "block rounded-[1.4rem] border border-[#00000012] bg-white/72 p-5 transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#8f4f2e66]";

  if (isHashLink) {
    return (
      <a href={href} className={className}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

function AiDesignerPanel({
  answers,
  isGenerating,
  lastRun,
  onAnswerChange,
  onGenerate,
  project,
}: {
  answers: BookGenerationQuestionnaireAnswers;
  isGenerating: boolean;
  lastRun: GenerationRun | null;
  onAnswerChange: <Key extends keyof BookGenerationQuestionnaireAnswers>(
    key: Key,
    value: BookGenerationQuestionnaireAnswers[Key],
  ) => void;
  onGenerate: () => void;
  project: Project;
}) {
  const canGenerate =
    project.photos.some((photo) => photo.approved) &&
    !project.resolutionTasks.some((task) => task.status !== "resolved");
  const approvedPhotoCount = project.photos.filter((photo) => photo.approved).length;
  const openBlockerCount = project.resolutionTasks.filter(
    (task) => task.status !== "resolved",
  ).length;
  const disabledMessage = !approvedPhotoCount
    ? "Add photos before making the book."
    : openBlockerCount
      ? "Clear the open fixes before making the book."
      : null;

  return (
    <section
      id="ai-designer"
      className="surface min-w-0 rounded-[2rem] p-6"
      aria-busy={isGenerating}
    >
      <div className="eyebrow">Step 2</div>
      <h2 className="display mt-2 text-3xl text-[#1f1814]">Make my photo book</h2>
      <p className="mt-3 text-sm leading-7 text-[#5b4f47]">
        Defaults are fine. The local AI picks templates, writes captions, and saves
        a draft you can edit.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Metric label="Photos ready" value={approvedPhotoCount} />
        <Metric label="Open fixes" value={openBlockerCount} />
      </div>

      <div className="mt-5 grid gap-3">
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b6f67]">
            What is this book for?
          </span>
          <textarea
            rows={2}
            value={answers.tripPurpose}
            onChange={(event) => onAnswerChange("tripPurpose", event.target.value)}
            className="w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm leading-6 text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b6f67]">
            Who is this book for?
          </span>
          <input
            type="text"
            value={answers.audience}
            onChange={(event) => onAnswerChange("audience", event.target.value)}
            placeholder="Us, our kids someday, grandparents, the whole trip group..."
            className="w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b6f67]">
            Moments that must appear
          </span>
          <textarea
            rows={2}
            value={answers.mustIncludeMoments}
            onChange={(event) => onAnswerChange("mustIncludeMoments", event.target.value)}
            placeholder="Pool, beach, dinner, arrival, favorite couple photo..."
            className="w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm leading-6 text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b6f67]">
            Cover photo preference
          </span>
          <input
            type="text"
            value={answers.coverPreference}
            onChange={(event) => onAnswerChange("coverPreference", event.target.value)}
            className="w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b6f67]">
            Names and privacy
          </span>
          <input
            type="text"
            value={answers.namesPrivacy}
            onChange={(event) => onAnswerChange("namesPrivacy", event.target.value)}
            placeholder="Use first names, avoid kids names, keep captions private..."
            className="w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b6f67]">
            Maps, food, tickets, and little details
          </span>
          <textarea
            rows={2}
            value={answers.mapMemorabiliaPreference}
            onChange={(event) => onAnswerChange("mapMemorabiliaPreference", event.target.value)}
            placeholder="Include menus and food details, skip maps, use little details between big moments..."
            className="w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm leading-6 text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b6f67]">
              Caption style
            </span>
            <select
              value={answers.captionDepth}
              onChange={(event) =>
                onAnswerChange(
                  "captionDepth",
                  event.target.value as BookGenerationQuestionnaireAnswers["captionDepth"],
                )
              }
              className="w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
            >
              <option value="short">Short</option>
              <option value="balanced">Balanced</option>
              <option value="story">Story</option>
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b6f67]">
              Writing tone
            </span>
            <select
              value={answers.tone}
              onChange={(event) =>
                onAnswerChange(
                  "tone",
                  event.target.value as BookGenerationQuestionnaireAnswers["tone"],
                )
              }
              className="w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
            >
              <option value="warm">Warm</option>
              <option value="reflective">Reflective</option>
              <option value="playful">Playful</option>
              <option value="factual">Simple and factual</option>
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b6f67]">
              Page fullness
            </span>
            <select
              value={answers.density}
              onChange={(event) =>
                onAnswerChange(
                  "density",
                  event.target.value as BookGenerationQuestionnaireAnswers["density"],
                )
              }
              className="w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
            >
              <option value="airy">Airy</option>
              <option value="balanced">Balanced</option>
              <option value="full">Full</option>
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b6f67]">
              Book size
            </span>
            <select
              value={answers.bookSize}
              onChange={(event) =>
                onAnswerChange(
                  "bookSize",
                  event.target.value as BookGenerationQuestionnaireAnswers["bookSize"],
                )
              }
              className="w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
            >
              <option value="12x12-square">Large square</option>
              <option value="10x10-square">Classic square</option>
              <option value="8x8-square">Small square</option>
              <option value="11x8.5-landscape">Landscape</option>
            </select>
          </label>
        </div>
      </div>

      <button
        type="button"
        disabled={isGenerating || !canGenerate}
        onClick={onGenerate}
        className="mt-5 w-full rounded-full border border-[#1f18141f] bg-[#1f1814] px-4 py-3 text-sm font-semibold text-[#f8efe7] transition-colors hover:bg-[#302721] disabled:cursor-not-allowed disabled:bg-[#b9aca1]"
      >
        {isGenerating ? "Making the book..." : "Make my book"}
      </button>
      {disabledMessage ? (
        <p className="mt-3 text-xs leading-6 text-[#8d4f33]">
          {disabledMessage}
        </p>
      ) : null}
      {lastRun ? (
        <div className="mt-5 rounded-[1.4rem] border border-[#00000012] bg-white/74 p-4 text-sm leading-6 text-[#5b4f47]">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b6f67]">
            Last book build: {formatGenerationStatus(lastRun.status)}
          </div>
          <div className="mt-2">Your editable book draft is ready to review.</div>
          {lastRun.progress.length ? (
            <div className="mt-2">Finished: {formatGenerationProgress(lastRun.progress)}</div>
          ) : null}
          {lastRun.validationWarnings.length ? (
            <div className="mt-2 text-[#8d4f33]">
              {lastRun.validationWarnings.slice(0, 2).map(formatGenerationWarning).join(" ")}
            </div>
          ) : null}
          <Link
            href={`/projects/${project.id}/editor`}
            className="mt-4 inline-flex rounded-full border border-[#1f18141f] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#1f1814] transition-colors hover:bg-[#fff8f2]"
          >
            Review and edit draft
          </Link>
          <Link
            href={`/projects/${project.id}/proof`}
            className="ml-2 mt-4 inline-flex rounded-full border border-[#1f18141f] bg-[#2e5c4d] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#f8efe7] transition-colors hover:bg-[#23483d]"
            style={{ color: "#f8efe7" }}
          >
            Save/print PDF
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.5rem] border border-[#00000012] bg-white/68 px-4 py-4">
      <div className="text-3xl font-semibold text-[#1f1814]">{value}</div>
      <div className="mt-2 break-words text-[11px] uppercase leading-4 tracking-[0.12em] text-[#796d65] sm:text-xs sm:tracking-[0.18em]">
        {label}
      </div>
    </div>
  );
}
