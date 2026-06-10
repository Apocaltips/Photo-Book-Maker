/* global AbortSignal, URL, console, fetch, process */

const baseUrl = (process.env.ALPHA_READINESS_BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const mode = (process.env.ALPHA_READINESS_MODE ?? "local").toLowerCase();
const strict = process.env.ALPHA_READINESS_STRICT !== "0";
const minTemplatePacks = Number.parseInt(process.env.ALPHA_READINESS_MIN_TEMPLATE_PACKS ?? "12", 10);
const minSpreadTemplates = Number.parseInt(
  process.env.ALPHA_READINESS_MIN_SPREAD_TEMPLATES ?? "64",
  10,
);
const minQualityScore = Number.parseInt(process.env.ALPHA_READINESS_MIN_QUALITY_SCORE ?? "75", 10);
const requireSavedRun = process.env.ALPHA_READINESS_REQUIRE_SAVED_RUN !== "0";
const requireAiHealth = process.env.ALPHA_READINESS_REQUIRE_AI_HEALTH !== "0";
const requireProviders =
  process.env.ALPHA_READINESS_REQUIRE_PROVIDERS === "1" ||
  mode === "hosted" ||
  mode === "provider";
const requireWorker =
  process.env.ALPHA_READINESS_REQUIRE_WORKER === "1" ||
  mode === "hosted" ||
  mode === "provider";
const expectAuthRequired =
  process.env.ALPHA_READINESS_EXPECT_AUTH_REQUIRED === "1" ||
  mode === "hosted" ||
  mode === "provider";

const checks = [];

function isLoopbackUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function hasValue(name) {
  return Boolean(process.env[name]?.trim());
}

function addCheck(status, name, detail, evidence = {}) {
  checks.push({
    detail,
    evidence,
    name,
    status,
  });
}

function pass(name, detail, evidence) {
  addCheck("pass", name, detail, evidence);
}

function warn(name, detail, evidence) {
  addCheck("warn", name, detail, evidence);
}

function fail(name, detail, evidence) {
  addCheck("fail", name, detail, evidence);
}

function skip(name, detail, evidence) {
  addCheck("skip", name, detail, evidence);
}

function requireEnvGroup(name, variables, required) {
  const missing = variables.filter((variable) => !hasValue(variable));

  if (!missing.length) {
    pass(`${name} env`, `${name} environment variables are present.`, {
      variables,
    });
    return;
  }

  const detail = `${name} is missing: ${missing.join(", ")}`;
  if (required) {
    fail(`${name} env`, detail, { missing, variables });
  } else {
    warn(`${name} env`, detail, { missing, variables });
  }
}

async function fetchRoute(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(8_000),
  });
  const text = await response.text();
  const body = await Promise.resolve()
    .then(() => (text ? JSON.parse(text) : {}))
    .catch(() => ({}));

  return {
    body,
    response,
    text,
  };
}

async function checkHomePage() {
  try {
    const { response, text } = await fetchRoute("/");
    if (response.ok && text.includes("Photo Book Maker")) {
      pass("web home", "Home page is reachable and renders the app shell.", {
        status: response.status,
      });
      return;
    }

    fail("web home", `Home page did not return the app shell: ${response.status}`, {
      bodyPreview: text.slice(0, 240),
      status: response.status,
    });
  } catch (error) {
    fail("web home", error instanceof Error ? error.message : "Home page check failed.");
  }
}

async function checkTemplateCatalog() {
  try {
    const { body, response } = await fetchRoute("/api/templates");
    const packCount = body.catalog?.bookTemplatePacks?.length ?? 0;
    const spreadCount = body.catalog?.spreadTemplates?.length ?? 0;

    if (response.ok && packCount >= minTemplatePacks && spreadCount >= minSpreadTemplates) {
      pass("template catalog", "Template catalog is large enough for alpha generation.", {
        packCount,
        spreadCount,
      });
      return;
    }

    fail(
      "template catalog",
      `Template catalog returned ${packCount} packs and ${spreadCount} spreads; expected at least ${minTemplatePacks}/${minSpreadTemplates}.`,
      {
        packCount,
        spreadCount,
        status: response.status,
      },
    );
  } catch (error) {
    fail("template catalog", error instanceof Error ? error.message : "Template check failed.");
  }
}

async function checkAuthGate() {
  try {
    const { body, response } = await fetchRoute("/api/projects");
    if (expectAuthRequired) {
      if (response.status === 401) {
        pass("project auth gate", "Unauthenticated project list is blocked.", {
          status: response.status,
        });
        return;
      }

      fail("project auth gate", `Expected 401 without auth, got ${response.status}.`, {
        body,
        status: response.status,
      });
      return;
    }

    if (response.ok || response.status === 401) {
      pass(
        "project auth gate",
        response.ok
          ? "Project list is reachable in local dev-auth mode."
          : "Project list requires auth.",
        {
          status: response.status,
        },
      );
      return;
    }

    fail("project auth gate", `Project list returned unexpected status ${response.status}.`, {
      body,
      status: response.status,
    });
  } catch (error) {
    fail("project auth gate", error instanceof Error ? error.message : "Auth gate check failed.");
  }
}

async function checkAiHealth() {
  if (!requireAiHealth) {
    skip("local AI health", "AI health route is not required for this readiness mode.");
    return;
  }

  try {
    const { body, response } = await fetchRoute("/api/ai/local/health");
    if (!response.ok) {
      fail("local AI health", `AI health route returned ${response.status}.`, {
        body,
        status: response.status,
      });
      return;
    }

    const missingModels = body.ai?.missingModels ?? [];
    const activeRuns = body.queue?.activeRuns ?? 0;
    const staleRuns = body.queue?.staleRuns ?? 0;
    const score = body.lastSavedRun?.qualityReport?.score;
    const workerEnabled = Boolean(body.worker?.queueEnabled);
    const workerSecretConfigured = Boolean(body.worker?.secretConfigured);

    if (!body.ai?.ollamaReachable) {
      fail("local AI health", "Ollama is not reachable from the checked app.", body.ai);
      return;
    }

    if (missingModels.length) {
      fail("local AI health", `Missing local model(s): ${missingModels.join(", ")}`, {
        missingModels,
      });
      return;
    }

    if (activeRuns || staleRuns) {
      fail("local AI queue", "AI queue has active or stale runs.", {
        activeRuns,
        staleRuns,
      });
      return;
    }

    if (requireSavedRun && (typeof score !== "number" || score < minQualityScore)) {
      fail(
        "local AI quality gate",
        `Last saved generation score is ${score ?? "missing"}; expected at least ${minQualityScore}.`,
        {
          minQualityScore,
          score,
        },
      );
      return;
    }

    if (requireWorker && (!workerEnabled || !workerSecretConfigured)) {
      fail("private AI worker", "Hosted alpha requires the private worker queue and secret.", {
        worker: body.worker,
      });
      return;
    }

    pass("local AI health", "Local AI health and queue gates passed.", {
      lastSavedScore: score ?? null,
      plannerMode: body.plannerStatus?.lastSavedPlannerMode ?? null,
      worker: body.worker ?? null,
    });
  } catch (error) {
    fail("local AI health", error instanceof Error ? error.message : "AI health check failed.");
  }
}

function checkProviderEnvironment() {
  requireEnvGroup(
    "Supabase",
    [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_PROJECTS_TABLE",
      "EXPO_PUBLIC_SUPABASE_URL",
      "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    ],
    requireProviders,
  );
  requireEnvGroup(
    "Object storage",
    [
      "PHOTO_STORAGE_BUCKET",
      "PHOTO_STORAGE_ENDPOINT",
      "PHOTO_STORAGE_ACCESS_KEY_ID",
      "PHOTO_STORAGE_SECRET_ACCESS_KEY",
    ],
    requireProviders,
  );

  if (!requireWorker) {
    skip("private AI worker env", "Private worker env is not required for this readiness mode.");
    return;
  }

  requireEnvGroup(
    "Private AI worker",
    [
      "LOCAL_AI_WORKER_ENABLED",
      "LOCAL_AI_WORKER_SECRET",
      "LOCAL_AI_WORKER_HOSTED_BASE_URL",
      "LOCAL_AI_WORKER_PROCESSOR_BASE_URL",
    ],
    true,
  );

  if (process.env.LOCAL_AI_WORKER_ENABLED !== "1") {
    fail("private AI worker enabled", "LOCAL_AI_WORKER_ENABLED must be 1 for hosted alpha.", {
      value: process.env.LOCAL_AI_WORKER_ENABLED ?? null,
    });
  } else {
    pass("private AI worker enabled", "LOCAL_AI_WORKER_ENABLED is 1.");
  }

  if (process.env.LOCAL_AI_DIRECT_IN_PRODUCTION === "1") {
    fail(
      "direct local AI production guard",
      "LOCAL_AI_DIRECT_IN_PRODUCTION must stay disabled for hosted alpha.",
    );
  } else {
    pass("direct local AI production guard", "Hosted app will not call local Ollama directly.");
  }

  const hostedBaseUrl = process.env.LOCAL_AI_WORKER_HOSTED_BASE_URL;
  const processorBaseUrl = process.env.LOCAL_AI_WORKER_PROCESSOR_BASE_URL;
  if (
    hostedBaseUrl &&
    processorBaseUrl &&
    hostedBaseUrl.replace(/\/$/, "") === processorBaseUrl.replace(/\/$/, "") &&
    !isLoopbackUrl(processorBaseUrl) &&
    process.env.LOCAL_AI_WORKER_ALLOW_HOSTED_PROCESSOR !== "1"
  ) {
    fail(
      "private AI processor URL",
      "LOCAL_AI_WORKER_PROCESSOR_BASE_URL must point to the private local processor, not the hosted app.",
      {
        hostedBaseUrl,
        processorBaseUrl,
      },
    );
  } else if (processorBaseUrl) {
    pass("private AI processor URL", "Private worker processor URL is acceptable.", {
      processorBaseUrl,
    });
  }
}

async function main() {
  checkProviderEnvironment();
  await checkHomePage();
  await checkTemplateCatalog();
  await checkAuthGate();
  await checkAiHealth();

  const failCount = checks.filter((check) => check.status === "fail").length;
  const warnCount = checks.filter((check) => check.status === "warn").length;
  const summary = {
    baseUrl,
    checks,
    mode,
    status: failCount ? "failed" : warnCount ? "warning" : "passed",
    totals: {
      fail: failCount,
      pass: checks.filter((check) => check.status === "pass").length,
      skip: checks.filter((check) => check.status === "skip").length,
      warn: warnCount,
    },
  };

  console.log(JSON.stringify(summary, null, 2));

  if (strict && failCount) {
    throw new Error(`Alpha readiness failed ${failCount} check(s).`);
  }
}

await main();
console.log("alpha readiness passed");
