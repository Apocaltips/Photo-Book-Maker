"use client";

import { formatProjectRange } from "@photo-book-maker/core";
import { BookDraftEditor } from "@/components/book-draft-editor";
import { WorkspaceAuthCard } from "@/components/workspace-auth-card";
import { useProjectWorkspace } from "@/hooks/use-project-workspace";

export function ProjectEditorPageClient({
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

  if (workspace.isAuthLoading || workspace.isProjectLoading) {
    return (
      <main className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-8 px-5 py-6 md:px-8 lg:px-10">
        <section className="rounded-[2rem] border border-[#00000010] bg-white/60 px-6 py-5">
          <div className="eyebrow">Draft editor</div>
          <h1 className="display mt-2 text-4xl text-[#1f1814] sm:text-5xl">
            Loading your workspace...
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

  return (
    <main className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-8 px-5 py-6 md:px-8 lg:px-10">
      <section className="rounded-[2rem] border border-[#00000010] bg-white/60 px-6 py-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="eyebrow">Draft editor / saved project</div>
            <h1 className="display mt-2 text-4xl text-[#1f1814] sm:text-5xl">
              {workspace.project.title}
            </h1>
            <p className="mt-3 text-sm leading-7 text-[#5a4e47]">
              {formatProjectRange(workspace.project)} in {workspace.project.timezone}. Use this
              editor to reshuffle the curated book, test alternate trims, and save
              multiple versions before export.
            </p>
          </div>

          {workspace.mode === "authenticated" ? (
            <button
              type="button"
              onClick={() => workspace.signOut()}
              className="rounded-full border border-[#00000012] bg-white/75 px-4 py-2 text-sm font-medium text-[#1f1814] transition-colors hover:bg-white"
            >
              Sign out
            </button>
          ) : null}
        </div>
      </section>

      <BookDraftEditor
        project={workspace.project}
        workspaceMode="authenticated"
        onSaveDraft={workspace.saveDraft}
        onPublishDraft={workspace.publishDraft}
        onRefreshAi={workspace.refreshAiDraft}
        previewHref={(draftId) =>
          draftId
            ? `/projects/${workspace.project!.id}/preview?draft=${draftId}`
            : `/projects/${workspace.project!.id}/preview`
        }
      />
    </main>
  );
}
