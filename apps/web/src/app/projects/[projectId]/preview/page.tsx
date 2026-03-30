import Link from "next/link";
import {
  createSeedProjects,
  findProjectById,
  formatProjectRange,
} from "@photo-book-maker/core";
import { notFound } from "next/navigation";
import { BookPreview } from "@/components/book-preview";

export const dynamic = "force-dynamic";

export default async function ProjectPreviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = findProjectById(createSeedProjects(), projectId);

  if (!project) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-5 py-6 md:px-8 lg:px-10">
      <section className="flex flex-col gap-4 rounded-[2rem] border border-[#00000010] bg-white/60 px-6 py-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="eyebrow">Book preview</div>
          <h1 className="display mt-2 text-4xl text-[#1f1814] sm:text-5xl">
            {project.title}
          </h1>
          <p className="mt-3 text-sm leading-7 text-[#5a4e47]">
            {formatProjectRange(project)} in {project.timezone}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/projects/${project.id}`}
            className="rounded-full border border-[#1f18141f] px-4 py-2 text-sm font-medium text-[#1f1814] transition-colors hover:bg-white/70"
          >
            Back to proof board
          </Link>
          <Link
            href={`/projects/${project.id}/editor`}
            className="rounded-full border border-[#1f18141f] bg-white/72 px-4 py-2 text-sm font-medium text-[#1f1814] transition-colors hover:bg-white"
          >
            Open draft editor
          </Link>
          <span className="rounded-full bg-[#1f1814] px-4 py-2 text-sm font-medium text-[#f7efe7]">
            Preview mode
          </span>
        </div>
      </section>

      <BookPreview project={project} />
    </main>
  );
}
