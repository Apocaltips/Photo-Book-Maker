"use client";

import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WorkspaceAuthCard } from "@/components/workspace-auth-card";
import { getBrowserSupabaseClient } from "@/lib/browser-supabase";

type InviteAcceptanceClientProps = {
  authConfig: { supabaseAnonKey: string; supabaseUrl: string };
  invite: {
    email: string;
    inviteId: string;
    projectId: string;
    projectTitle: string;
    status: "accepted" | "sent";
    token: string;
  };
};

function normalizeConfigValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.trim();
}

export function InviteAcceptanceClient({
  authConfig,
  invite,
}: InviteAcceptanceClientProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(
    invite.status === "accepted"
      ? "This invite was already accepted. Sign in with the invited account to open the book."
      : null,
  );
  const [hasAccepted, setHasAccepted] = useState(invite.status === "accepted");

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

  async function acceptInvite(accessToken: string) {
    setIsAccepting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/projects/${invite.projectId}/invites/${invite.inviteId}/accept`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token: invite.token }),
        },
      );
      const body = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(body.message || "Unable to accept the invite.");
      }

      setHasAccepted(true);
      setMessage(body.message ?? "Invite accepted.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to accept the invite.",
      );
    } finally {
      setIsAccepting(false);
    }
  }

  useEffect(() => {
    if (!session?.access_token || hasAccepted || isAccepting) {
      return;
    }

    if ((session.user.email ?? "").toLowerCase() !== invite.email.toLowerCase()) {
      return;
    }

    acceptInvite(session.access_token).catch(() => {
      // surfaced via error state
    });
  }, [
    hasAccepted,
    invite.email,
    invite.inviteId,
    invite.projectId,
    invite.token,
    isAccepting,
    session?.access_token,
    session?.user.email,
  ]);

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
    setSession(null);
    setError(null);
  }

  const signedInEmail = session?.user.email?.toLowerCase() ?? null;
  const emailMatchesInvite = signedInEmail === invite.email.toLowerCase();

  if (isAuthLoading) {
    return (
      <main className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-8 px-5 py-6 md:px-8 lg:px-10">
        <section className="surface rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow">Collaborator invite</div>
          <h1 className="display mt-3 text-4xl text-[#1f1814] sm:text-5xl">
            Loading invite...
          </h1>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-8 px-5 py-6 md:px-8 lg:px-10">
        <WorkspaceAuthCard
          body={`Join "${invite.projectTitle}" with the invited email ${invite.email}. Once you sign in, the book will open automatically.`}
          helperText="Use the same email address that received the invite. If you already have an account, just sign in."
          isConfigured={Boolean(authConfig.supabaseUrl && authConfig.supabaseAnonKey)}
          onSignIn={signIn}
          onSignUp={signUp}
          title={`Accept your invite to "${invite.projectTitle}"`}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-8 px-5 py-6 md:px-8 lg:px-10">
      <section className="surface rounded-[2rem] p-6 md:p-8">
        <div className="eyebrow">Collaborator invite</div>
        <h1 className="display mt-3 text-4xl text-[#1f1814] sm:text-5xl">
          {invite.projectTitle}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[#5b4f47]">
          {emailMatchesInvite
            ? "The invited account is signed in. We can finish joining the shared book now."
            : `You are signed in as ${session.user.email}. Sign out and switch to ${invite.email} to accept this invite.`}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {!emailMatchesInvite ? (
            <button
              type="button"
              onClick={() => signOut()}
              className="rounded-full bg-[#1f1814] px-5 py-3 text-sm font-semibold text-[#f8efe7] transition-colors hover:bg-[#302721]"
            >
              Sign out and switch account
            </button>
          ) : hasAccepted ? (
            <>
              <Link
                href={`/projects/${invite.projectId}`}
                className="rounded-full bg-[#1f1814] px-5 py-3 text-sm font-semibold text-[#f8efe7] transition-colors hover:bg-[#302721]"
              >
                Open shared book
              </Link>
              <Link
                href={`/projects/${invite.projectId}/editor`}
                className="rounded-full border border-[#00000012] bg-white/75 px-5 py-3 text-sm font-semibold text-[#1f1814] transition-colors hover:bg-white"
              >
                Open web editor
              </Link>
            </>
          ) : (
            <button
              type="button"
              onClick={() => session.access_token && acceptInvite(session.access_token)}
              disabled={isAccepting}
              className="rounded-full bg-[#1f1814] px-5 py-3 text-sm font-semibold text-[#f8efe7] transition-colors hover:bg-[#302721] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isAccepting ? "Joining book..." : "Join shared book"}
            </button>
          )}
        </div>

        {message ? (
          <div className="mt-5 rounded-[1.2rem] border border-[#d8c8b8] bg-[#fff8f2] px-4 py-3 text-sm leading-7 text-[#6b5647]">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-[1.2rem] border border-[#f0b49a] bg-[#fff4ef] px-4 py-3 text-sm leading-7 text-[#8d4727]">
            {error}
          </div>
        ) : null}
      </section>
    </main>
  );
}
