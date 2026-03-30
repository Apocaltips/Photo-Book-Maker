import Link from "next/link";
import { createSeedProjects, listOpenTasks } from "@photo-book-maker/core";
import { ProjectCard } from "@/components/project-card";

export const dynamic = "force-dynamic";

export default async function Home() {
  const projects = createSeedProjects();
  const openTasks = listOpenTasks(projects);
  const totalPhotos = projects.reduce((sum, project) => sum + project.photos.length, 0);
  const totalPages = projects.reduce(
    (sum, project) => sum + project.bookDraft.pages.length,
    0,
  );

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 px-5 py-6 md:px-8 lg:px-10">
      <section className="surface-strong grid gap-8 rounded-[2.5rem] px-6 py-8 md:grid-cols-[1.4fr_0.8fr] md:px-10 md:py-12">
        <div className="space-y-6">
          <div className="eyebrow">Mobile-first trip books</div>
          <div className="space-y-5">
            <h1 className="display max-w-3xl text-5xl leading-none text-[#1f1814] sm:text-6xl lg:text-7xl">
              Build photo books that look edited by a real design team, not a script.
            </h1>
            <p className="max-w-2xl text-base leading-8 text-[#5c5048] md:text-lg">
              The Android and iOS apps are the main experience. The web app exists as a
              companion surface for bigger-screen review, timeline cleanup, and print
              export.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Highlight label="Projects in motion" value={projects.length} />
            <Highlight label="Photos curated" value={totalPhotos} />
            <Highlight label="Draft pages laid out" value={totalPages} />
          </div>
        </div>

        <div className="rounded-[2rem] border border-[#00000012] bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(242,230,220,0.9))] p-6">
          <div className="eyebrow">Professional output system</div>
          <ul className="mt-4 space-y-4 text-sm leading-7 text-[#4d433d]">
            <li>12x12 square print format with curated hero, spread, collage, and recap layouts.</li>
            <li>Conservative enhancement only: exposure, color, noise, and straightening.</li>
            <li>Location fallback uses trip context before asking humans to resolve gaps.</li>
            <li>Mock print checkout is wired now so the flow feels real before a vendor exists.</li>
          </ul>
          <div className="mt-6 rounded-[1.5rem] bg-[#1f1814] px-5 py-4 text-sm text-[#f7efe7]">
            The current prototype keeps everything visually editorial so the eventual PDF
            export has the right design DNA from day one.
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="eyebrow">Active projects</div>
              <h2 className="display mt-2 text-4xl text-[#1f1814]">Trips and yearbooks</h2>
            </div>
            <Link
              href="/projects/yellowstone-weekend"
              className="rounded-full border border-[#1f18141f] px-4 py-2 text-sm font-medium text-[#1f1814] transition-colors hover:bg-white/70"
            >
              Open flagship prototype
            </Link>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </div>

        <aside className="surface rounded-[2rem] p-6">
          <div className="eyebrow">Needs attention</div>
          <h2 className="display mt-2 text-3xl text-[#1f1814]">Resolution queue</h2>
          <div className="mt-6 space-y-4">
            {openTasks.map((task) => (
              <div
                key={task.id}
                className="rounded-[1.4rem] border border-[#00000012] bg-white/70 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs uppercase tracking-[0.18em] text-[#8d4f33]">
                    {task.type}
                  </span>
                  <span className="text-xs text-[#6d625a]">{task.projectTitle}</span>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-[#221b17]">{task.title}</h3>
                <p className="mt-2 text-sm leading-7 text-[#5e534b]">{task.detail}</p>
                <div className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-[#7b7068]">
                  {task.dueLabel}
                </div>
              </div>
            ))}
            {openTasks.length === 0 ? (
              <p className="text-sm text-[#5e534b]">
                No unresolved metadata tasks. Every project is ready for a clean export.
              </p>
            ) : null}
          </div>
        </aside>
      </section>
    </main>
  );
}

function Highlight({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.5rem] border border-[#00000012] bg-white/64 px-4 py-4">
      <div className="text-3xl font-semibold text-[#1f1814]">{value}</div>
      <div className="mt-2 text-xs uppercase tracking-[0.18em] text-[#796d65]">
        {label}
      </div>
    </div>
  );
}
