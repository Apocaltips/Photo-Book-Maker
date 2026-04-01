"use client";

import {
  formatProjectRange,
  getProjectSummary,
  getYearbookCycleLabel,
} from "@photo-book-maker/core";
import Link from "next/link";
import { StatusPill } from "@/components/status-pill";
import { WorkspaceAuthCard } from "@/components/workspace-auth-card";
import { useProjectWorkspace } from "@/hooks/use-project-workspace";

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
  const selectedTheme =
    project.bookThemes.find((theme) => theme.id === project.selectedThemeId) ??
    project.bookThemes[0];

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-5 py-6 md:px-8 lg:px-10">
      <section className="surface-strong rounded-[2.5rem] px-6 py-8 md:px-10 md:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="eyebrow">Saved project</div>
            <h1 className="display mt-3 text-5xl leading-none text-[#1f1814] sm:text-6xl">
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
                Open book preview
              </Link>
              <Link
                href={`/projects/${project.id}/editor`}
                className="rounded-full border border-[#1f18141f] bg-[#1f1814] px-4 py-2 text-sm font-medium text-[#f8efe7] transition-colors hover:bg-[#302721]"
              >
                Open draft editor
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

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <Metric label="Approved photos" value={summary.approvedPhotos} />
          <Metric label="Must-include picks" value={summary.mustIncludePhotos} />
          <Metric label="Open tasks" value={summary.openTasks} />
          <Metric label="Draft pages" value={summary.pageCount} />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="surface rounded-[2rem] p-6">
          <div className="eyebrow">Curated proof board</div>
          <h2 className="display mt-2 text-3xl text-[#1f1814]">Current working draft</h2>
          <p className="mt-3 text-sm leading-7 text-[#5b4f47]">{project.bookDraft.summary}</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {project.bookDraft.pages.map((page, index) => (
              <div
                key={page.id}
                className="rounded-[1.6rem] border border-[#00000012] bg-white/74 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs uppercase tracking-[0.18em] text-[#7d7067]">
                    Spread {index + 1}
                  </span>
                  <span className="rounded-full bg-[#f1ebe4] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6f625b]">
                    {page.style.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="mt-3 text-xl font-semibold text-[#211a16]">{page.title}</div>
                <p className="mt-2 text-sm leading-7 text-[#5d524b]">{page.caption}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <section className="surface rounded-[2rem] p-6">
            <div className="eyebrow">Published drafts</div>
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
                  Publish a named draft from the editor once you want to compare alternate versions.
                </div>
              )}
            </div>
          </section>

          <section className="surface rounded-[2rem] p-6">
            <div className="eyebrow">Theme + print readiness</div>
            <h2 className="display mt-2 text-3xl text-[#1f1814]">{selectedTheme.name}</h2>
            <p className="mt-3 text-sm leading-7 text-[#5b4f47]">
              {selectedTheme.mood}. Typography: {selectedTheme.typeface}.
            </p>
            <div className="mt-5 rounded-[1.6rem] bg-[#1f1814] p-5 text-[#f6eee7]">
              <div className="text-xs uppercase tracking-[0.18em] text-[#d8bea8]">
                Print prep
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
                  <span>Open blockers</span>
                  <span>{summary.openTasks}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Export path</span>
                  <span>Mobile proof PDF</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.5rem] border border-[#00000012] bg-white/68 px-4 py-4">
      <div className="text-3xl font-semibold text-[#1f1814]">{value}</div>
      <div className="mt-2 text-xs uppercase tracking-[0.18em] text-[#796d65]">
        {label}
      </div>
    </div>
  );
}
