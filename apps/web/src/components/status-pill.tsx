import type { ProjectStatus } from "@photo-book-maker/core";

const toneMap: Record<ProjectStatus, string> = {
  collecting: "bg-[#f3e6d8] text-[#8b562f]",
  needs_resolution: "bg-[#f8ded2] text-[#983d16]",
  reviewing: "bg-[#dce7f0] text-[#375f86]",
  ready_to_print: "bg-[#ddeee6] text-[#245744]",
  printed: "bg-[#ece7f4] text-[#5a4b7d]",
};

export function StatusPill({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${toneMap[status]}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}
