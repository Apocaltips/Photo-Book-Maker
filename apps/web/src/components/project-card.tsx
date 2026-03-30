import Link from "next/link";
import {
  formatProjectRange,
  getYearbookCycleLabel,
  getProjectSummary,
  type Project,
} from "@photo-book-maker/core";

const statusTone: Record<Project["status"], string> = {
  collecting: "bg-[#f3e6d8] text-[#8b562f]",
  needs_resolution: "bg-[#f8ded2] text-[#983d16]",
  reviewing: "bg-[#dce7f0] text-[#375f86]",
  ready_to_print: "bg-[#ddeee6] text-[#245744]",
  printed: "bg-[#ece7f4] text-[#5a4b7d]",
};

export function ProjectCard({ project }: { project: Project }) {
  const summary = getProjectSummary(project);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="surface group flex h-full flex-col justify-between rounded-[2rem] p-6 transition-transform duration-300 hover:-translate-y-1"
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow">
              {project.type === "trip" ? "Trip project" : "Yearbook project"}
            </div>
            <h2 className="display mt-2 text-4xl leading-none text-[#1e1713]">
              {project.title}
            </h2>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone[project.status]}`}
          >
            {project.status.replaceAll("_", " ")}
          </span>
        </div>

        <p className="max-w-xl text-sm leading-7 text-[#544941]">
          {project.subtitle}
        </p>
      </div>

      <div className="mt-8 space-y-5">
        <div className="flex items-center justify-between border-y border-[#00000012] py-3 text-sm text-[#5e534a]">
          <span>{formatProjectRange(project)}</span>
          <span>{project.timezone}</span>
        </div>
        {project.type === "yearbook" && project.yearbookCycle ? (
          <div className="text-xs uppercase tracking-[0.18em] text-[#7a6e65]">
            {getYearbookCycleLabel(project.yearbookCycle)}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="Approved photos" value={summary.approvedPhotos} />
          <Stat label="Must include" value={summary.mustIncludePhotos} />
          <Stat label="Open tasks" value={summary.openTasks} />
          <Stat label="Pages" value={summary.pageCount} />
        </div>

        <div className="flex items-center justify-between pt-2 text-sm font-medium text-[#1e1713]">
          <span>{summary.acceptedInvites} collaborators joined</span>
          <span className="text-[#bf6a3d] transition-transform duration-300 group-hover:translate-x-1">
            Open project
          </span>
        </div>
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.25rem] border border-[#00000012] bg-white/55 px-4 py-3">
      <div className="text-xl font-semibold text-[#1f1814]">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[#7a6e65]">
        {label}
      </div>
    </div>
  );
}
