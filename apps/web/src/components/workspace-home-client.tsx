"use client";

import {
  listOpenTasks,
  type Project,
} from "@photo-book-maker/core";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { ProjectCard } from "@/components/project-card";
import { WorkspaceAuthCard } from "@/components/workspace-auth-card";
import { getBrowserSupabaseClient } from "@/lib/browser-supabase";

type WorkspaceAuthConfig = {
  supabaseAnonKey: string;
  supabaseUrl: string;
};

function normalizeConfigValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.trim();
}

export function WorkspaceHomeClient({
  authConfig,
}: {
  authConfig: WorkspaceAuthConfig;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isProjectsLoading, setIsProjectsLoading] = useState(false);

  const supabase = useMemo(() => {
    const supabaseUrl = normalizeConfigValue(authConfig.supabaseUrl);
    const supabaseAnonKey = normalizeConfigValue(authConfig.supabaseAnonKey);

    if (!supabaseUrl || !supabaseAnonKey) {
      return null;
    }

    return getBrowserSupabaseClient({
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
    });
  }, [authConfig.supabaseAnonKey, authConfig.supabaseUrl]);

  useEffect(() => {
    if (!supabase) {
      setIsAuthLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }

      setSession(data.session ?? null);
      setIsAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    const accessToken = session?.access_token;

    if (!accessToken) {
      setProjects([]);
      setError(null);
      return;
    }

    let active = true;

    async function loadProjects() {
      setIsProjectsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/projects", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        });
        const body = (await response.json()) as { message?: string; projects?: Project[] };

        if (!response.ok || !body.projects) {
          throw new Error(body.message || "Unable to load your projects.");
        }

        if (!active) {
          return;
        }

        setProjects(body.projects);
      } catch (caughtError) {
        if (!active) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to load your projects.",
        );
      } finally {
        if (active) {
          setIsProjectsLoading(false);
        }
      }
    }

    void loadProjects();

    return () => {
      active = false;
    };
  }, [session?.access_token]);

  async function signIn(input: { email: string; password: string }) {
    if (!supabase) {
      throw new Error("Supabase browser auth is not configured.");
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: input.email.trim(),
      password: input.password,
    });

    if (signInError) {
      throw new Error(signInError.message);
    }
  }

  async function signUp(input: { email: string; name: string; password: string }) {
    if (!supabase) {
      throw new Error("Supabase browser auth is not configured.");
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        data: {
          full_name: input.name.trim() || input.email.split("@")[0],
        },
      },
    });

    if (signUpError) {
      throw new Error(signUpError.message);
    }
  }

  async function signOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
  }

  if (isAuthLoading) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-5 py-6 md:px-8 lg:px-10">
        <section className="surface-strong rounded-[2.5rem] px-6 py-8 md:px-10 md:py-12">
          <div className="eyebrow">Workspace</div>
          <h1 className="display mt-3 text-5xl leading-none text-[#1f1814] sm:text-6xl">
            Loading your books...
          </h1>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-8 px-5 py-6 md:px-8 lg:px-10">
        <WorkspaceAuthCard
          body="Sign in with the same account you use on mobile to open your real shared books, web editor drafts, collaborator invites, and printable previews."
          helperText="Book creation and photo upload start on mobile. The web workspace is for review, editing, collaboration, and preview."
          isConfigured={Boolean(authConfig.supabaseUrl && authConfig.supabaseAnonKey)}
          onSignIn={signIn}
          onSignUp={signUp}
          title="Sign in to open your real book workspace."
        />
      </main>
    );
  }

  const openTasks = listOpenTasks(projects);
  const totalPages = projects.reduce(
    (sum, project) => sum + project.bookDraft.pages.length,
    0,
  );
  const confirmedCopy = projects.reduce(
    (sum, project) =>
      sum +
      project.bookDraft.pages.filter((page) => page.copyStatus === "confirmed").length,
    0,
  );

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-5 py-6 md:px-8 lg:px-10">
      <section className="surface-strong grid gap-8 rounded-[2.5rem] px-6 py-8 md:grid-cols-[1.3fr_0.7fr] md:px-10 md:py-12">
        <div className="space-y-5">
          <div className="eyebrow">Live workspace</div>
          <h1 className="display max-w-3xl text-5xl leading-none text-[#1f1814] sm:text-6xl lg:text-7xl">
            Real books, real collaborators, and the actual drafts tied to your account.
          </h1>
          <p className="max-w-2xl text-base leading-8 text-[#5c5048] md:text-lg">
            Mobile handles capture and uploads. Web handles the shared draft board,
            editor, collaborator acceptance, and book preview.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Highlight label="Projects" value={projects.length} />
            <Highlight label="Spreads drafted" value={totalPages} />
            <Highlight label="Copy confirmed" value={confirmedCopy} />
          </div>
        </div>

        <div className="rounded-[2rem] border border-[#00000012] bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(242,230,220,0.9))] p-6">
          <div className="eyebrow">Account</div>
          <div className="mt-4 text-2xl font-semibold text-[#1f1814]">
            {session.user.email}
          </div>
          <p className="mt-3 text-sm leading-7 text-[#4d433d]">
            Use this workspace to open proof boards, edit drafts, accept collaborator
            invites, and review print-ready previews.
          </p>
          <div className="mt-6 rounded-[1.5rem] bg-[#1f1814] px-5 py-4 text-sm text-[#f7efe7]">
            Proof export still happens from the mobile app today. The web workspace is
            now fully tied to the same live project data.
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-6 rounded-full border border-[#1f18141f] bg-white/80 px-4 py-2 text-sm font-medium text-[#1f1814] transition-colors hover:bg-white"
          >
            Sign out
          </button>
        </div>
      </section>

      {error ? (
        <section className="rounded-[1.8rem] border border-[#d9c7b9] bg-[#fff8f2] px-5 py-4 text-sm leading-7 text-[#6d5544]">
          {error}
        </section>
      ) : null}

      {isProjectsLoading ? (
        <section className="surface rounded-[2rem] p-6 text-sm text-[#5f544d]">
          Loading your saved projects...
        </section>
      ) : null}

      {!isProjectsLoading && !projects.length ? (
        <section className="surface rounded-[2rem] p-6">
          <div className="eyebrow">No books yet</div>
          <h2 className="display mt-2 text-3xl text-[#1f1814]">Start your first project on mobile.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[#5f544d]">
            The live app no longer boots into sample books. Create the trip or yearbook on
            your phone, upload photos there, and then come back here to edit the draft.
          </p>
        </section>
      ) : null}

      {projects.length ? (
        <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-4">
            <div>
              <div className="eyebrow">Your projects</div>
              <h2 className="display mt-2 text-4xl text-[#1f1814]">Books in motion</h2>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          </div>

          <aside className="surface rounded-[2rem] p-6">
            <div className="eyebrow">Needs attention</div>
            <h2 className="display mt-2 text-3xl text-[#1f1814]">Resolution queue</h2>
            <div className="mt-6 space-y-4">
              {openTasks.length ? (
                openTasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-[1.4rem] border border-[#00000012] bg-white/70 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs uppercase tracking-[0.18em] text-[#8d4f33]">
                        {task.type}
                      </span>
                      <span className="text-xs text-[#6d625a]">{task.projectTitle}</span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-[#221b17]">{task.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-[#5e534b]">{task.detail}</p>
                    <div className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-[#7b7068]">
                      {task.dueLabel}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#5e534b]">
                  No unresolved metadata blockers. Your current books are ready for
                  proof review.
                </p>
              )}
            </div>
          </aside>
        </section>
      ) : null}
    </main>
  );
}

function Highlight({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.5rem] border border-[#00000012] bg-white/64 px-4 py-4">
      <div className="text-3xl font-semibold text-[#1f1814]">{value}</div>
      <div className="mt-2 text-xs uppercase tracking-[0.18em] text-[#796d65]">
        {label}
      </div>
    </div>
  );
}
