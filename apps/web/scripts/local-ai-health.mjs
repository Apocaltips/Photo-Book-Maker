/* global console, fetch, process */

const baseUrl = (process.env.LOCAL_AI_HEALTH_BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const strict = process.env.LOCAL_AI_HEALTH_STRICT !== "0";
const requireSavedRun = process.env.LOCAL_AI_HEALTH_REQUIRE_SAVED_RUN !== "0";
const minQualityScore = Number.parseInt(process.env.LOCAL_AI_HEALTH_MIN_SCORE ?? "75", 10);
const disallowDeterministicFallback =
  process.env.LOCAL_AI_HEALTH_DISALLOW_DETERMINISTIC_FALLBACK === "1";

async function main() {
  const response = await fetch(`${baseUrl}/api/ai/local/health`);
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `Local AI health endpoint failed: ${response.status} ${JSON.stringify(body)}`,
    );
  }

  const summary = {
    lastSavedRun: body.lastSavedRun
      ? {
          plannerMode: body.plannerStatus?.lastSavedPlannerMode ?? null,
          projectTitle: body.lastSavedRun.projectTitle,
          qualityScore: body.lastSavedRun.qualityReport?.score ?? null,
          runId: body.lastSavedRun.runId,
          status: body.lastSavedRun.status,
          warnings: body.lastSavedRun.validationWarnings?.length ?? 0,
        }
      : null,
    latestRun: body.latestRun
      ? {
          plannerMode: body.plannerStatus?.latestPlannerMode ?? null,
          projectTitle: body.latestRun.projectTitle,
          qualityScore: body.latestRun.qualityReport?.score ?? null,
          runId: body.latestRun.runId,
          status: body.latestRun.status,
          warnings: body.latestRun.validationWarnings?.length ?? 0,
        }
      : null,
    localAiStatus: body.ai?.status,
    missingModels: body.ai?.missingModels ?? [],
    ollamaReachable: body.ai?.ollamaReachable,
    plannerStatus: body.plannerStatus,
    queue: body.queue,
    runtimeConfig: body.ai?.config ?? null,
    store: body.store,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!strict) {
    return;
  }

  if (!body.ai?.ollamaReachable) {
    throw new Error("Ollama is not reachable. Start Ollama before tester sessions.");
  }

  if (body.ai?.missingModels?.length) {
    throw new Error(
      `Missing local model(s): ${body.ai.missingModels.join(", ")}. Run ollama pull for each model.`,
    );
  }

  if (body.queue?.activeRuns) {
    throw new Error("A local AI generation run is still active. Wait for it before starting another smoke.");
  }

  if (requireSavedRun) {
    if (!body.lastSavedRun) {
      throw new Error("No saved AI generation run exists. Run npm run test:ai:local before tester sessions.");
    }

    const qualityScore = body.lastSavedRun.qualityReport?.score;
    if (typeof qualityScore !== "number") {
      throw new Error("The last saved AI generation run does not have a quality report.");
    }

    if (qualityScore < minQualityScore) {
      throw new Error(
        `The last saved AI generation quality score ${qualityScore}/100 is below the ${minQualityScore}/100 alpha gate.`,
      );
    }
  }

  if (
    disallowDeterministicFallback &&
    body.plannerStatus?.deterministicFallbackUsedInLastSaved
  ) {
    throw new Error(
      "The last saved generation used the deterministic fallback. Allow it with LOCAL_AI_HEALTH_DISALLOW_DETERMINISTIC_FALLBACK=0 or tune the local planner.",
    );
  }
}

await main();
console.log("local AI health passed");
