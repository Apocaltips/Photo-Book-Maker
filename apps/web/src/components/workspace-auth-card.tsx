"use client";

import { useState } from "react";

export function WorkspaceAuthCard({
  isConfigured,
  onSignIn,
  onSignUp,
}: {
  isConfigured: boolean;
  onSignIn: (input: { email: string; password: string }) => Promise<void>;
  onSignUp: (input: { email: string; name: string; password: string }) => Promise<void>;
}) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (!isConfigured) {
      setMessage("Supabase browser auth is not configured for the web app yet.");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      if (mode === "sign-up") {
        await onSignUp({ email, password, name });
        setMessage(
          "Account created. If email confirmation is on in Supabase, confirm your inbox before signing in.",
        );
      } else {
        await onSignIn({ email, password });
        setMessage("Signed in. Loading your draft workspace now.");
      }
    } catch (caughtError) {
      setMessage(
        caughtError instanceof Error ? caughtError.message : "Unable to authenticate.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="surface rounded-[2.2rem] p-6 md:p-8">
      <div className="eyebrow">Private workspace</div>
      <h2 className="display mt-3 text-4xl text-[#1f1814] sm:text-5xl">
        Sign in to load your saved draft.
      </h2>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-[#5b4f47]">
        The Yellowstone demo stays public, but your saved editor state and published
        draft versions live behind your Supabase account.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setMode("sign-in")}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${mode === "sign-in" ? "bg-[#1f1814] text-[#f8efe7]" : "border border-[#00000012] bg-white/75 text-[#1f1814]"}`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("sign-up")}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${mode === "sign-up" ? "bg-[#1f1814] text-[#f8efe7]" : "border border-[#00000012] bg-white/75 text-[#1f1814]"}`}
        >
          Create account
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {mode === "sign-up" ? (
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.18em] text-[#7c7067]">
              Full name
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
            />
          </label>
        ) : null}

        <label className="space-y-2">
          <span className="text-xs uppercase tracking-[0.18em] text-[#7c7067]">
            Email
          </span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs uppercase tracking-[0.18em] text-[#7c7067]">
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-[1.1rem] border border-[#00000014] bg-[#fffaf5] px-4 py-3 text-sm text-[#1f1814] outline-none transition-colors focus:border-[#8f4f2e44]"
          />
        </label>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="rounded-full bg-[#1f1814] px-5 py-3 text-sm font-semibold text-[#f8efe7] transition-colors hover:bg-[#302721] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Working..." : mode === "sign-up" ? "Create account" : "Sign in"}
        </button>
        <div className="text-sm leading-7 text-[#6c6058]">
          Use the same owner account you created in the mobile app if you want the same projects.
        </div>
      </div>

      {message ? (
        <div className="mt-4 rounded-[1.2rem] border border-[#d8c8b8] bg-[#fff8f2] px-4 py-3 text-sm leading-7 text-[#6b5647]">
          {message}
        </div>
      ) : null}
    </section>
  );
}
