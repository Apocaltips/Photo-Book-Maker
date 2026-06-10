"use client";

import {
  buildProofHtml,
  getPreviewDraft,
  type BookPrintPreviewMode,
} from "@photo-book-maker/core";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { WorkspaceAuthCard } from "@/components/workspace-auth-card";
import { useProjectWorkspace } from "@/hooks/use-project-workspace";

export function ProjectPrintProofPageClient({
  authConfig,
  projectId,
}: {
  authConfig: { supabaseAnonKey: string; supabaseUrl: string };
  projectId: string;
}) {
  const searchParams = useSearchParams();
  const selectedDraftId = searchParams.get("draft") ?? undefined;
  const [printPreviewMode, setPrintPreviewMode] =
    useState<BookPrintPreviewMode>("print_safe");
  const proofFrameRef = useRef<HTMLIFrameElement>(null);
  const workspace = useProjectWorkspace({
    authConfig,
    projectId,
  });

  const previewDraft = useMemo(() => {
    if (!workspace.project) {
      return null;
    }

    const draft = getPreviewDraft(workspace.project, selectedDraftId);
    return {
      ...draft,
      editorState: {
        ...draft.editorState,
        printPreviewMode,
      },
    };
  }, [printPreviewMode, selectedDraftId, workspace.project]);

  const proofHtml = useMemo(() => {
    if (!workspace.project) {
      return "";
    }

    return buildProofHtml(workspace.project, {
      draftId: selectedDraftId,
      includeBleedGuides: printPreviewMode === "bleed",
      includePrintSafeGuides: printPreviewMode === "bleed" || printPreviewMode === "print_safe",
      projectId: workspace.project.id,
    });
  }, [printPreviewMode, selectedDraftId, workspace.project]);

  function printProof() {
    const proofWindow = proofFrameRef.current?.contentWindow;

    if (proofWindow) {
      proofWindow.focus();
      proofWindow.print();
      return;
    }

    window.print();
  }

  if (workspace.isAuthLoading || workspace.isProjectLoading) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-5 py-6 md:px-8 lg:px-10">
        <section className="rounded-[2rem] border border-[#00000010] bg-white/60 px-6 py-5">
          <div className="eyebrow">Print proof</div>
          <h1 className="display mt-2 text-4xl text-[#1f1814] sm:text-5xl">
            Loading your print PDF page...
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
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-5 py-6 md:px-8 lg:px-10 print-proof-page">
      <style>{`
        @media print {
          body {
            background: #fff !important;
          }

          .no-print {
            display: none !important;
          }

          .print-proof-page {
            max-width: none !important;
            padding: 0 !important;
          }

          .print-proof-page section {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <section className="no-print flex flex-col gap-4 rounded-[2rem] border border-[#00000010] bg-white/72 px-6 py-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="eyebrow">Final step</div>
          <h1 className="display mt-2 text-4xl text-[#1f1814] sm:text-5xl">
            Save or print your book PDF
          </h1>
          <p className="mt-3 text-sm leading-7 text-[#5a4e47]">
            Review the book exactly as a print proof. Choose Print or Save as PDF
            when it looks right.
          </p>
          <div className="mt-4 grid gap-2 text-sm text-[#5a4e47] sm:grid-cols-3">
            <div className="rounded-[1rem] border border-[#00000010] bg-white/70 px-3 py-3">
              1. Check the preview.
            </div>
            <div className="rounded-[1rem] border border-[#00000010] bg-white/70 px-3 py-3">
              2. Tap Save as PDF.
            </div>
            <div className="rounded-[1rem] border border-[#00000010] bg-white/70 px-3 py-3">
              3. Send that PDF to print.
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {(["print_safe", "bleed", "clean"] as BookPrintPreviewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setPrintPreviewMode(mode)}
              className={`rounded-full px-4 py-2 text-sm font-semibold capitalize transition-colors ${
                printPreviewMode === mode
                  ? "bg-[#1f1814] text-[#f7efe7]"
                  : "border border-[#1f18141f] bg-white/72 text-[#1f1814]"
              }`}
            >
              {mode.replaceAll("_", " ")}
            </button>
          ))}
          <button
            type="button"
            onClick={printProof}
            className="rounded-full border border-[#1f18141f] bg-[#1f1814] px-4 py-2 text-sm font-medium text-[#f7efe7]"
          >
            Print or save PDF
          </button>
          <Link
            href={`/projects/${workspace.project.id}/editor`}
            className="rounded-full border border-[#1f18141f] bg-white/72 px-4 py-2 text-sm font-medium text-[#1f1814] transition-colors hover:bg-white"
          >
            Back to edit pages
          </Link>
          <Link
            href={`/projects/${workspace.project.id}`}
            className="rounded-full border border-[#1f18141f] bg-white/72 px-4 py-2 text-sm font-medium text-[#1f1814] transition-colors hover:bg-white"
          >
            Back to book
          </Link>
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-[#00000010] bg-white/80 shadow-[0_24px_80px_rgba(31,24,20,0.12)]">
        <div className="no-print border-b border-[#00000010] bg-[#fffaf5] px-5 py-4 text-sm leading-6 text-[#5a4e47]">
          Showing the full print proof for {previewDraft.title}. It includes the cover
          and all {previewDraft.draft.pages.length} spread
          {previewDraft.draft.pages.length === 1 ? "" : "s"}.
        </div>
        <iframe
          ref={proofFrameRef}
          title={`${previewDraft.title} full print proof`}
          srcDoc={proofHtml}
          className="h-[78vh] w-full bg-[#ece7df] print:h-screen"
          sandbox="allow-same-origin allow-modals"
        />
      </section>
    </main>
  );
}
