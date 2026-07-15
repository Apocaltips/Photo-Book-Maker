"use client";

import type {
  BookDraftEditorState,
  BookGenerationQuestionnaire,
  BookGenerationQuestionnaireAnswers,
  GenerationRun,
  Project,
} from "@photo-book-maker/core";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/browser-supabase";
import { DEV_AUTH_EMAIL, getDevAuthHeaders } from "@/lib/dev-auth";

type WorkspaceAuthConfig = {
  supabaseAnonKey: string;
  supabaseUrl: string;
};

type DraftMutationPayload = {
  bookDraft?: Project["bookDraft"];
  draftEditorState?: BookDraftEditorState;
  selectedThemeId?: string;
  subtitle?: string;
  title?: string;
};

type GenerationRunPayload = {
  questionnaire?: Partial<BookGenerationQuestionnaireAnswers>;
};

type GenerationRunStatusPayload = {
  revision: number;
  run: GenerationRun;
};

type AuthInput = {
  email: string;
  name?: string;
  password: string;
};

function normalizeConfigValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.trim();
}

export function useProjectWorkspace({
  authConfig,
  projectId,
}: {
  authConfig: WorkspaceAuthConfig;
  projectId: string;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isProjectLoading, setIsProjectLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const isDevAuthMode = !supabase;
  const devAuthHeaders = useMemo(() => getDevAuthHeaders(), []);

  function getAuthorizedHeaders() {
    return session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : devAuthHeaders;
  }

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

  async function fetchProjectWithHeaders(headers: Record<string, string>) {
    setIsProjectLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        headers,
        cache: "no-store",
      });
      const body = (await response.json()) as { message?: string; project?: Project };

      if (!response.ok || !body.project) {
        throw new Error(body.message || "Unable to load this project.");
      }

      setProject(body.project);
      return body.project;
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Unable to load this project.";
      setError(message);
      throw caughtError;
    } finally {
      setIsProjectLoading(false);
    }
  }

  useEffect(() => {
    if (session?.access_token) {
      fetchProjectWithHeaders(getAuthorizedHeaders()).catch(() => {
        // Surface the message through hook state and keep the previous project if available.
      });
      return;
    }

    if (isDevAuthMode) {
      fetchProjectWithHeaders(getAuthorizedHeaders()).catch(() => {
        // Surface the message through hook state and keep the previous project if available.
      });
      return;
    }

    if (!session?.access_token) {
      setProject(null);
      return;
    }
  }, [devAuthHeaders, isDevAuthMode, projectId, session?.access_token]);

  async function requestProjectUpdate(
    path: string,
    init: RequestInit,
  ) {
    if (!session?.access_token && !isDevAuthMode) {
      throw new Error("Sign in to save book drafts across devices.");
    }

    setError(null);

    const requestBody =
      typeof init.body === "string"
        ? JSON.stringify({
            ...JSON.parse(init.body),
            expectedRevision: project?.revision,
          })
        : init.body;
    const response = await fetch(path, {
      ...init,
      body: requestBody,
      headers: {
        ...getAuthorizedHeaders(),
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const responseBody = (await response.json()) as { message?: string; project?: Project };

    if (!response.ok || !responseBody.project) {
      throw new Error(responseBody.message || "Unable to update this project.");
    }

    setProject(responseBody.project);
    return responseBody.project;
  }

  async function saveDraft(payload: DraftMutationPayload) {
    return requestProjectUpdate(`/api/projects/${projectId}/draft`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  async function publishDraft(name: string, payload: DraftMutationPayload) {
    return requestProjectUpdate(`/api/projects/${projectId}/drafts`, {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        name,
      }),
    });
  }

  async function refreshAiDraft(payload: DraftMutationPayload) {
    return requestProjectUpdate(`/api/projects/${projectId}/draft-ai`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function fetchGenerationQuestions() {
    const response = await fetch(`/api/projects/${projectId}/generation/questions`, {
      headers: getAuthorizedHeaders(),
      cache: "no-store",
    });
    const body = (await response.json()) as {
      message?: string;
      questionnaire?: BookGenerationQuestionnaire;
    };

    if (!response.ok || !body.questionnaire) {
      throw new Error(body.message || "Unable to load AI designer questions.");
    }

    return body.questionnaire;
  }

  async function generateAiBook(payload: GenerationRunPayload = {}) {
    const response = await fetch(`/api/projects/${projectId}/generation/run`, {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        expectedRevision: project?.revision,
      }),
      headers: {
        ...getAuthorizedHeaders(),
        "Content-Type": "application/json",
      },
    });
    const responseBody = (await response.json()) as {
      message?: string;
      project?: Project;
      run?: GenerationRun;
    };

    if (!response.ok || !responseBody.project) {
      throw new Error(responseBody.message || "Unable to generate this AI-designed book.");
    }

    setProject(responseBody.project);
    return {
      project: responseBody.project,
      run: responseBody.run,
    };
  }

  async function fetchGenerationRun(runId: string) {
    const response = await fetch(
      `/api/projects/${projectId}/generation/runs/${runId}`,
      {
        headers: getAuthorizedHeaders(),
        cache: "no-store",
      },
    );
    const body = (await response.json().catch(() => ({}))) as
      | GenerationRunStatusPayload
      | { message?: string };

    if (!response.ok || !("run" in body)) {
      const message = "message" in body ? body.message : null;
      throw new Error(message || "Unable to refresh AI book progress.");
    }

    return body;
  }

  async function signIn(input: AuthInput) {
    if (!supabase) {
      setSession({
        access_token: "dev-token",
        user: { email: DEV_AUTH_EMAIL },
      } as Session);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: input.email.trim(),
      password: input.password,
    });

    if (signInError) {
      throw new Error(signInError.message);
    }
  }

  async function signUp(input: AuthInput) {
    if (!supabase) {
      setSession({
        access_token: "dev-token",
        user: { email: input.email.trim() || DEV_AUTH_EMAIL },
      } as Session);
      return;
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        data: {
          full_name: input.name?.trim() || input.email.split("@")[0],
        },
      },
    });

    if (signUpError) {
      throw new Error(signUpError.message);
    }
  }

  async function signOut() {
    if (!supabase) {
      setSession(null);
      return;
    }

    await supabase.auth.signOut();
  }

  const mode =
    session?.access_token || isDevAuthMode
      ? "authenticated"
      : supabase
        ? "auth-required"
        : "auth-unconfigured";

  return {
    error,
    fetchGenerationQuestions,
    generateAiBook,
    isAuthLoading,
    isProjectLoading,
    mode,
    project,
    refreshAiDraft,
    refreshProject:
      session?.access_token || isDevAuthMode
        ? () => fetchProjectWithHeaders(getAuthorizedHeaders())
        : null,
    saveDraft,
    session,
    signIn,
    signOut,
    signUp,
    fetchGenerationRun,
    publishDraft,
  };
}
