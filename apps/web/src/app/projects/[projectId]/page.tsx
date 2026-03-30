import {
  createSeedProjects,
  findProjectById,
  formatProjectRange,
  getYearbookCycleLabel,
  getProjectSummary,
} from "@photo-book-maker/core";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { StatusPill } from "@/components/status-pill";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = findProjectById(createSeedProjects(), projectId);

  if (!project) {
    notFound();
  }

  const summary = getProjectSummary(project);
  const selectedTheme =
    project.bookThemes.find((theme) => theme.id === project.selectedThemeId) ??
    project.bookThemes[0];

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-5 py-6 md:px-8 lg:px-10">
      <section className="surface-strong rounded-[2.5rem] px-6 py-8 md:px-10 md:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="eyebrow">
              {project.type === "trip" ? "Trip project" : "Yearbook project"}
            </div>
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

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Panel
            eyebrow="Contributors"
            title="Members, invites, and note prompts"
            body="Invites are email-based, participants fix unresolved metadata, and notes feed the caption drafts."
          >
            <div className="grid gap-4 md:grid-cols-2">
              {project.members.map((member) => (
                <div
                  key={member.id}
                  className="rounded-[1.5rem] border border-[#00000012] bg-white/72 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1f1814] text-sm font-semibold text-white">
                      {member.avatarLabel}
                    </div>
                    <div>
                      <div className="font-semibold text-[#211a16]">{member.name}</div>
                      <div className="text-sm text-[#70645c]">{member.email}</div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-sm text-[#5d524b]">
                    <span>{member.role}</span>
                    <span>{member.homeBase}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-[1.5rem] border border-[#00000012] bg-[#fdf8f3] p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-[#8a5b42]">
                Journal prompts
              </div>
              <div className="mt-3 grid gap-4">
                {project.notes.map((note) => (
                  <div key={note.id}>
                    <div className="font-semibold text-[#211a16]">{note.title}</div>
                    <p className="mt-1 text-sm leading-7 text-[#5d524b]">{note.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel
            eyebrow="Photos and AI"
            title="Timeline curation"
            body="The current draft stays chronological, keeps edits conservative, and flags anything that needs human confirmation."
          >
            <div className="grid gap-3">
              {project.photos.map((photo) => (
                <div
                  key={photo.id}
                  className="grid gap-3 rounded-[1.5rem] border border-[#00000012] bg-white/72 p-4 md:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold text-[#211a16]">{photo.title}</div>
                      {photo.mustInclude ? (
                        <span className="rounded-full bg-[#f7dfcf] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#98461d]">
                          Must include
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-sm text-[#6c6058]">
                      {new Date(photo.capturedAt).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </div>
                    <div className="mt-2 text-sm leading-7 text-[#5c514a]">
                      {photo.locationLabel
                        ? `${photo.locationLabel} (${photo.locationConfidence})`
                        : "No location confirmed yet."}
                    </div>
                    <div className="mt-2 text-sm leading-7 text-[#5c514a]">
                      {photo.qualityNotes.join(" ")}
                    </div>
                  </div>
                  <div className="text-right text-xs uppercase tracking-[0.18em] text-[#7b7068]">
                    {photo.orientation}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel
            eyebrow="Resolution"
            title="Tasks blocking export"
            body="Trips cannot move into print export until every missing location, person tag, and ordering issue is resolved."
          >
            <div className="space-y-4">
              {project.resolutionTasks.length === 0 ? (
                <div className="rounded-[1.5rem] border border-[#00000012] bg-[#eef6f2] p-5 text-sm leading-7 text-[#2e5d48]">
                  No open blockers. This project is ready for a clean proof export.
                </div>
              ) : (
                project.resolutionTasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-[1.5rem] border border-[#00000012] bg-white/72 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs uppercase tracking-[0.18em] text-[#8d4f33]">
                        {task.type}
                      </span>
                      <span className="text-xs text-[#6c6058]">{task.status}</span>
                    </div>
                    <div className="mt-3 text-lg font-semibold text-[#211a16]">{task.title}</div>
                    <p className="mt-2 text-sm leading-7 text-[#5c514a]">{task.detail}</p>
                    <div className="mt-3 text-xs uppercase tracking-[0.18em] text-[#7a6f67]">
                      {task.dueLabel}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel
            eyebrow="Book draft"
            title="Professional auto-layout preview"
            body={`Theme: ${selectedTheme.name}. ${project.bookDraft.summary}`}
          >
            <div className="space-y-4">
              {project.bookDraft.pages.map((page, index) => (
                <div
                  key={page.id}
                  className="rounded-[1.75rem] border border-[#00000012] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,241,234,0.95))] p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.18em] text-[#7d7067]">
                      Spread {index + 1}
                    </span>
                    <span className="rounded-full bg-[#ece4db] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7c6656]">
                      {page.style.replaceAll("_", " ")}
                    </span>
                  </div>
                  <h3 className="display mt-4 text-3xl text-[#211a16]">{page.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#5d524b]">{page.caption}</p>
                  <div className="mt-4 border-t border-[#00000012] pt-4 text-sm text-[#625750]">
                    {page.layoutNote}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            eyebrow="Mock print flow"
            title="Order handoff"
            body="The current prototype generates a believable print path now so vendor integration can land later without rewriting the user flow."
          >
            <div className="rounded-[1.6rem] bg-[#1f1814] p-5 text-[#f6eee7]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-[#d8bea8]">
                    Mock order status
                  </div>
                  <div className="mt-2 text-2xl font-semibold capitalize">
                    {project.mockPrintOrder.status}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-[0.18em] text-[#d8bea8]">
                    Order code
                  </div>
                  <div className="mt-2 text-lg font-semibold">
                    {project.mockPrintOrder.orderCode}
                  </div>
                </div>
              </div>
              <div className="mt-5 grid gap-3 text-sm text-[#eadfd4]">
                <div className="flex items-center justify-between gap-3">
                  <span>Destination</span>
                  <span>
                    {project.mockPrintOrder.shippingName}, {project.mockPrintOrder.shippingCity}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Estimated ship window</span>
                  <span>{project.mockPrintOrder.estimatedShipWindow}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Current mock total</span>
                  <span>${(project.mockPrintOrder.priceCents / 100).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </Panel>
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

function Panel({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <section className="surface rounded-[2rem] p-6">
      <div className="eyebrow">{eyebrow}</div>
      <h2 className="display mt-2 text-3xl text-[#1f1814]">{title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-[#5b4f47]">{body}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}
