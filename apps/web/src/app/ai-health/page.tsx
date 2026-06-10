import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocalAiHealthStatus } from "@/lib/server/local-ai-health-status";

export const dynamic = "force-dynamic";

export default async function LocalAiHealthPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.LOCAL_AI_HEALTH_PUBLIC !== "1"
  ) {
    notFound();
  }

  const status = await getLocalAiHealthStatus();
  const { ai, lastSavedRun, latestRun, plannerStatus, projects, queue, store } = status;
  const statusTone =
    ai.status === "healthy"
      ? "bg-[#dfeee7] text-[#285940]"
      : ai.status === "degraded"
        ? "bg-[#fff1d7] text-[#7a5120]"
        : "bg-[#ffe1d8] text-[#893d28]";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 py-6 md:px-8 lg:px-10">
      <section className="surface-strong rounded-[2.5rem] px-6 py-8 md:px-10">
        <div className="eyebrow">Local AI test rig</div>
        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="display text-4xl leading-tight text-[#1f1814] sm:text-6xl">
              Ollama curator health
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[#5b4f47] md:text-base">
              Use this page before tester sessions to confirm the local planner,
              vision model, project store, and latest generated book quality.
            </p>
          </div>
          <span className={`rounded-full px-4 py-2 text-sm font-semibold ${statusTone}`}>
            {ai.status}
          </span>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        <HealthCard label="Ollama" value={ai.ollamaReachable ? "Reachable" : "Offline"} />
        <HealthCard label="Store mode" value={store.mode} />
        <HealthCard label="Projects" value={String(projects.length)} />
      </section>

      <section className="surface rounded-[2rem] p-6">
        <div className="eyebrow">Models</div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {ai.expectedModels.map((model) => (
            <div
              key={`${model.role}-${model.name}`}
              className="rounded-[1.4rem] border border-[#00000012] bg-white/72 p-4"
            >
              <div className="text-xs uppercase tracking-[0.18em] text-[#7b6f67]">
                {model.role}
              </div>
              <div className="mt-2 break-words text-lg font-semibold text-[#1f1814]">
                {model.name}
              </div>
              <div className="mt-3 text-sm text-[#5b4f47]">
                {model.installed ? "Installed" : "Missing"}
              </div>
            </div>
          ))}
        </div>
        {ai.warning ? (
          <p className="mt-4 rounded-[1.2rem] bg-[#fff8f2] px-4 py-3 text-sm leading-6 text-[#8d4f33]">
            {ai.warning}
          </p>
        ) : null}
      </section>

      <section className="surface rounded-[2rem] p-6">
        <div className="eyebrow">Configuration</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <ConfigRow label="Base URL" value={ai.config.baseUrl} />
          <ConfigRow label="Provider" value={ai.config.provider} />
          <ConfigRow label="Primary planner timeout" value={`${ai.config.plannerTimeoutMs}ms`} />
          <ConfigRow
            label="Fallback planner timeout"
            value={`${ai.config.fallbackPlannerTimeoutMs}ms`}
          />
          <ConfigRow label="Primary output budget" value={`${ai.config.plannerNumPredict} tokens`} />
          <ConfigRow
            label="Fallback output budget"
            value={`${ai.config.fallbackPlannerNumPredict} tokens`}
          />
          <ConfigRow label="Vision budget" value={`${ai.config.visionMaxPhotos} photos`} />
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-4">
        <HealthCard label="Active runs" value={String(queue.activeRuns)} />
        <HealthCard label="Saved runs" value={String(queue.savedRuns)} />
        <HealthCard label="Failed runs" value={String(queue.failedRuns)} />
        <HealthCard
          label="Last saved planner"
          value={formatPlannerMode(plannerStatus.lastSavedPlannerMode)}
        />
      </section>

      <section className="surface rounded-[2rem] p-6">
        <div className="eyebrow">Latest generation</div>
        {latestRun ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <HealthCard label="Project" value={latestRun.projectTitle} />
              <HealthCard label="Status" value={latestRun.status} />
              <HealthCard
                label="Quality"
                value={
                  latestRun.qualityReport
                    ? `${latestRun.qualityReport.score}/100`
                    : "Not scored"
                }
              />
              <HealthCard
                label="Warnings"
                value={String(latestRun.validationWarnings.length)}
              />
            </div>
            {plannerStatus.fallbackUsedInLatest ? (
              <p className="rounded-[1.2rem] bg-[#fff8f2] px-4 py-3 text-sm leading-6 text-[#7a5120]">
                Latest run used {formatPlannerMode(plannerStatus.latestPlannerMode)}.
                This is acceptable for local alpha when quality gates pass, but it
                means the primary planner did not complete for that run.
              </p>
            ) : null}
            {latestRun.qualityReport?.warnings.length ? (
              <div className="rounded-[1.4rem] border border-[#00000012] bg-white/72 p-4 text-sm leading-7 text-[#5b4f47]">
                {latestRun.qualityReport.warnings.slice(0, 5).join(" ")}
              </div>
            ) : null}
            <Link
              href={`/projects/${latestRun.projectId}`}
              className="inline-flex rounded-full border border-[#1f18141f] bg-[#1f1814] px-5 py-2.5 text-sm font-semibold text-[#f8efe7]"
              style={{ color: "#f8efe7" }}
            >
              Open latest project
            </Link>
          </div>
        ) : (
          <p className="mt-3 text-sm leading-7 text-[#5b4f47]">
            No generation runs have been saved yet.
          </p>
        )}
      </section>

      <section className="surface rounded-[2rem] p-6">
        <div className="eyebrow">Last successful generation</div>
        {lastSavedRun ? (
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <HealthCard label="Project" value={lastSavedRun.projectTitle} />
            <HealthCard
              label="Quality"
              value={
                lastSavedRun.qualityReport
                  ? `${lastSavedRun.qualityReport.score}/100`
                  : "Not scored"
              }
            />
            <HealthCard
              label="Photos used"
              value={
                lastSavedRun.qualityReport
                  ? `${lastSavedRun.qualityReport.usedPhotoCount}/${lastSavedRun.qualityReport.approvedPhotoCount}`
                  : "Unknown"
              }
            />
            <HealthCard
              label="Planner"
              value={formatPlannerMode(plannerStatus.lastSavedPlannerMode)}
            />
          </div>
        ) : (
          <p className="mt-3 text-sm leading-7 text-[#5b4f47]">
            No saved generation run is available yet. Run the local AI smoke
            before using the app with outside testers.
          </p>
        )}
      </section>
    </main>
  );
}

function HealthCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface rounded-[1.8rem] p-5">
      <div className="text-xs uppercase tracking-[0.18em] text-[#7b6f67]">{label}</div>
      <div className="mt-3 break-words text-2xl font-semibold text-[#1f1814]">
        {value}
      </div>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.2rem] border border-[#00000012] bg-white/72 px-4 py-3">
      <div className="text-xs uppercase tracking-[0.16em] text-[#7b6f67]">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-[#1f1814]">{value}</div>
    </div>
  );
}

function formatPlannerMode(mode: string) {
  switch (mode) {
    case "primary-planner":
      return "Primary";
    case "fallback-planner":
      return "Fallback";
    case "deterministic-fallback":
      return "Safe fallback";
    case "custom-planner":
      return "Custom";
    default:
      return "None";
  }
}
