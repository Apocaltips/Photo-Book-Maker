"use client";

import { getPreviewDraft, type Project } from "@photo-book-maker/core";
import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { BookPreview } from "@/components/book-preview";
import { WorkspaceAuthCard } from "@/components/workspace-auth-card";
import { useProjectWorkspace } from "@/hooks/use-project-workspace";

export function ProjectPreviewPageClient({
  authConfig,
  projectId,
  seedProject,
}: {
  authConfig: { supabaseAnonKey: string; supabaseUrl: string };
  projectId: string;
  seedProject: Project | null;
}) {
  const searchParams = useSearchParams();
  const selectedDraftId = searchParams.get("draft") ?? undefined;
  const workspace = useProjectWorkspace({
    authConfig,
    projectId,
    seedProject,
  });

  const previewDraft = useMemo(() => {
    if (!workspace.project) {
      return null;
    }

    return getPreviewDraft(workspace.project, selectedDraftId);
  }, [selectedDraftId, workspace.project]);

  if (workspace.isAuthLoading || workspace.isProjectLoading) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-5 py-6 md:px-8 lg:px-10">
        <section className="rounded-[2rem] border border-[#00000010] bg-white/60 px-6 py-5">
          <div className="eyebrow">Book preview</div>
          <h1 className="display mt-2 text-4xl text-[#1f1814] sm:text-5xl">
            Loading preview...
          </h1>
        </section>
      </main>
    );
  }

  if (!workspace.project || !previewDraft) {
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

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-5 py-6 md:px-8 lg:px-10">
      <section className="flex flex-col gap-4 rounded-[2rem] border border-[#00000010] bg-white/60 px-6 py-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="eyebrow">
            {workspace.mode === "authenticated" ? "Saved book preview" : "Demo book preview"}
          </div>
          <h1 className="display mt-2 text-4xl text-[#1f1814] sm:text-5xl">
            {previewDraft.name}
          </h1>
          <p className="mt-3 text-sm leading-7 text-[#5a4e47]">
            Previewing the exact saved draft object, not a parallel mock layout.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/projects/${workspace.project.id}`}
            className="rounded-full border border-[#1f18141f] px-4 py-2 text-sm font-medium text-[#1f1814] transition-colors hover:bg-white/70"
          >
            Back to proof board
          </Link>
          <Link
            href={`/projects/${workspace.project.id}/editor`}
            className="rounded-full border border-[#1f18141f] bg-white/72 px-4 py-2 text-sm font-medium text-[#1f1814] transition-colors hover:bg-white"
          >
            Open draft editor
          </Link>
          {workspace.mode === "authenticated" ? (
            <button
              type="button"
              onClick={() => workspace.signOut()}
              className="rounded-full border border-[#1f18141f] bg-[#1f1814] px-4 py-2 text-sm font-medium text-[#f7efe7]"
            >
              Sign out
            </button>
          ) : (
            <span className="rounded-full bg-[#1f1814] px-4 py-2 text-sm font-medium text-[#f7efe7]">
              Demo mode
            </span>
          )}
        </div>
      </section>

      <section className="rounded-[2rem] border border-[#00000010] bg-white/78 px-5 py-5">
        <div className="text-xs uppercase tracking-[0.18em] text-[#7b6f67]">
          Preview sources
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/projects/${workspace.project.id}/preview`}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${!selectedDraftId ? "bg-[#1f1814] text-[#f7efe7]" : "border border-[#00000012] bg-white text-[#1f1814]"}`}
          >
            Working draft
          </Link>
          {workspace.project.publishedDrafts?.map((draft) => (
            <Link
              key={draft.id}
              href={`/projects/${workspace.project!.id}/preview?draft=${draft.id}`}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${selectedDraftId === draft.id ? "bg-[#1f1814] text-[#f7efe7]" : "border border-[#00000012] bg-white text-[#1f1814]"}`}
            >
              {draft.name}
            </Link>
          ))}
        </div>
      </section>

      <BookPreview
        project={workspace.project}
        draft={previewDraft.draft}
        draftName={previewDraft.name}
        draftSavedAt={previewDraft.savedAt}
        editorState={previewDraft.editorState}
        selectedThemeId={previewDraft.selectedThemeId}
        subtitle={previewDraft.subtitle}
        title={previewDraft.title}
      />
    </main>
  );
}
