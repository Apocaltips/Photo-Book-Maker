/* global console, fetch, process */

const baseUrl = (process.env.LOCAL_AI_HEALTH_BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const strict = process.env.LOCAL_AI_HEALTH_STRICT !== "0";

async function main() {
  const response = await fetch(`${baseUrl}/api/ai/local/health`);
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `Local AI health endpoint failed: ${response.status} ${JSON.stringify(body)}`,
    );
  }

  const summary = {
    latestRun: body.latestRun
      ? {
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
    queue: body.queue,
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
}

await main();
console.log("local AI health passed");
