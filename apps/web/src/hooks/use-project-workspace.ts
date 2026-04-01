"use client";

import type {
  BookDraftEditorState,
  Project,
} from "@photo-book-maker/core";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/browser-supabase";

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

  async function fetchProjectWithToken(token: string) {
    setIsProjectLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
    if (!session?.access_token) {
      setProject(null);
      return;
    }

    fetchProjectWithToken(session.access_token).catch(() => {
      // Surface the message through hook state and keep the previous project if available.
    });
  }, [projectId, session?.access_token]);

  async function requestProjectUpdate(
    path: string,
    init: RequestInit,
  ) {
    if (!session?.access_token) {
      throw new Error("Sign in to save book drafts across devices.");
    }

    setError(null);

    const response = await fetch(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const body = (await response.json()) as { message?: string; project?: Project };

    if (!response.ok || !body.project) {
      throw new Error(body.message || "Unable to update this project.");
    }

    setProject(body.project);
    return body.project;
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

  async function signIn(input: AuthInput) {
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

  async function signUp(input: AuthInput) {
    if (!supabase) {
      throw new Error("Supabase browser auth is not configured.");
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
      return;
    }

    await supabase.auth.signOut();
  }

  const mode =
    session?.access_token
      ? "authenticated"
      : supabase
        ? "auth-required"
        : "auth-unconfigured";

  return {
    error,
    isAuthLoading,
    isProjectLoading,
    mode,
    project,
    refreshAiDraft,
    refreshProject: session?.access_token
      ? () => fetchProjectWithToken(session.access_token)
      : null,
    saveDraft,
    session,
    signIn,
    signOut,
    signUp,
    publishDraft,
  };
}
