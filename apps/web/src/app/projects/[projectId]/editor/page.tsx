import {
  createSeedProjects,
  findProjectById,
  formatProjectRange,
} from "@photo-book-maker/core";
import { notFound } from "next/navigation";
import { BookDraftEditor } from "@/components/book-draft-editor";

export const dynamic = "force-dynamic";

export default async function ProjectEditorPage({
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
    <main className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-8 px-5 py-6 md:px-8 lg:px-10">
      <section className="rounded-[2rem] border border-[#00000010] bg-white/60 px-6 py-5">
        <div className="eyebrow">Draft editor</div>
        <h1 className="display mt-2 text-4xl text-[#1f1814] sm:text-5xl">
          {project.title}
        </h1>
        <p className="mt-3 text-sm leading-7 text-[#5a4e47]">
          {formatProjectRange(project)} in {project.timezone}. Use this editor to
          reshuffle the curated book, test alternate trims, and save multiple
          versions before export.
        </p>
      </section>

      <BookDraftEditor project={project} />
    </main>
  );
}
