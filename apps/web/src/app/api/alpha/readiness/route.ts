import {
  listTemplateCatalog,
  type GenerationRun,
  type Project,
} from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { getAiWorkerQueueConfig } from "@/lib/server/ai-worker-auth";
import {
  isLocalObjectStorageEnabled,
  isObjectStorageConfigured,
} from "@/lib/server/object-storage";
import { getProjectStoreMode, readProjects } from "@/lib/server/project-store";
import { getPublicSupabaseAuthConfig } from "@/lib/server/public-auth-config";

export const dynamic = "force-dynamic";

type ReadinessStatus = "fail" | "pass" | "skip" | "warn";

type ReadinessCheck = {
  detail: string;
  evidence?: Record<string, unknown>;
  name: string;
  status: ReadinessStatus;
};

type GenerationRunEntry = {
  project: Project;
  run: GenerationRun;
};

const ACTIVE_RUN_STATUSES: GenerationRun["status"][] = [
  "analyzing_photos",
  "planning",
  "queued",
  "validating",
];

function getReadinessSecret() {
  return process.env.ALPHA_READINESS_SECRET ?? process.env.TRIGGER_SECRET_KEY ?? "";
}

function authorizeReadinessRequest(request: Request) {
  const secret = getReadinessSecret();

  if (!secret) {
    return NextResponse.json(
      { message: "Alpha readiness secret is not configured." },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization");
  const bearer = authorization?.replace(/^Bearer\s+/i, "").trim();
  const headerSecret = request.headers.get("x-photo-book-alpha-readiness-secret");

  if (bearer !== secret && headerSecret !== secret) {
    return NextResponse.json(
      { message: "Alpha readiness authorization failed." },
      { status: 401 },
    );
  }

  return null;
}

function getRequestedMode(request: Request) {
  const mode =
    new URL(request.url).searchParams.get("mode") ??
    process.env.ALPHA_READINESS_MODE ??
    "local";

  return mode.toLowerCase();
}

function parseMinEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasEnvValue(name: string) {
  return Boolean(process.env[name]?.trim());
}

function getMissingEnv(variables: string[]) {
  return variables.filter((variable) => !hasEnvValue(variable));
}

function shouldCheckPhaseTwoProviders(mode: string) {
  return (
    mode === "hosted" ||
    mode === "provider" ||
    process.env.ALPHA_READINESS_REQUIRE_COMMERCE === "1" ||
    process.env.ALPHA_READINESS_REQUIRE_EMAIL === "1" ||
    process.env.ALPHA_READINESS_REQUIRE_OBSERVABILITY === "1" ||
    process.env.ALPHA_READINESS_REQUIRE_PRINT_PROVIDER === "1"
  );
}

function shouldRequirePhaseTwoGroup(mode: string, envName: string) {
  return process.env[envName] === "1" || mode === "provider";
}

function addCheck(
  checks: ReadinessCheck[],
  status: ReadinessStatus,
  name: string,
  detail: string,
  evidence?: Record<string, unknown>,
) {
  checks.push({
    detail,
    evidence,
    name,
    status,
  });
}

function addEnvGroupCheck(
  checks: ReadinessCheck[],
  name: string,
  variables: string[],
  required: boolean,
) {
  const missing = getMissingEnv(variables);

  if (!missing.length) {
    addCheck(checks, "pass", `${name} env`, `${name} environment variables are present.`, {
      variables,
    });
    return;
  }

  addCheck(
    checks,
    required ? "fail" : "warn",
    `${name} env`,
    `${name} is missing: ${missing.join(", ")}`,
    { missing, variables },
  );
}

function addStripeChecks(checks: ReadinessCheck[], required: boolean) {
  addEnvGroupCheck(
    checks,
    "Stripe checkout",
    ["STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET"],
    required,
  );
  addEnvGroupCheck(
    checks,
    "Stripe product prices",
    ["STRIPE_PRICE_TRIP_BOOK_ID", "STRIPE_PRICE_YEARBOOK_ID"],
    required,
  );
}

function addEmailChecks(checks: ReadinessCheck[], required: boolean) {
  const hasResend = hasEnvValue("RESEND_API_KEY");
  const hasPostmark = hasEnvValue("POSTMARK_SERVER_TOKEN");
  const hasSender = hasEnvValue("TRANSACTIONAL_EMAIL_FROM");

  addCheck(
    checks,
    hasResend || hasPostmark ? "pass" : required ? "fail" : "warn",
    "transactional email provider",
    hasResend || hasPostmark
      ? "A transactional email provider is configured."
      : "Configure Resend or Postmark before branded invites and order emails.",
    {
      hasPostmark,
      hasResend,
      providers: ["RESEND_API_KEY", "POSTMARK_SERVER_TOKEN"],
    },
  );

  addCheck(
    checks,
    hasSender ? "pass" : required ? "fail" : "warn",
    "transactional email sender",
    hasSender
      ? "Transactional email sender is configured."
      : "TRANSACTIONAL_EMAIL_FROM is required before sending branded customer email.",
    {
      variable: "TRANSACTIONAL_EMAIL_FROM",
    },
  );
}

function addObservabilityChecks(checks: ReadinessCheck[], required: boolean) {
  const hasSentry = hasEnvValue("SENTRY_DSN") || hasEnvValue("NEXT_PUBLIC_SENTRY_DSN");
  const hasPostHog = hasEnvValue("NEXT_PUBLIC_POSTHOG_KEY");

  addCheck(
    checks,
    hasSentry ? "pass" : required ? "fail" : "warn",
    "Sentry observability",
    hasSentry
      ? "Sentry is configured for runtime error visibility."
      : "Configure Sentry before provider alpha so upload, checkout, and print errors are visible.",
    {
      variables: ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"],
    },
  );

  addCheck(
    checks,
    hasPostHog ? "pass" : required ? "fail" : "warn",
    "PostHog analytics",
    hasPostHog
      ? "PostHog analytics key is configured."
      : "Configure PostHog before provider alpha to measure upload-to-proof and checkout drop-off.",
    {
      variables: ["NEXT_PUBLIC_POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_HOST"],
    },
  );
}

function addPrintProviderChecks(checks: ReadinessCheck[], required: boolean) {
  const provider = process.env.PRINT_PROVIDER?.trim().toLowerCase() ?? "";
  const allowedProviders = [
    "manual_pdf",
    "peecho",
    "prodigi",
    "cloudprinter",
    "rpi_blurb",
    "lulu",
    "gelato",
  ];
  const isKnownProvider = provider ? allowedProviders.includes(provider) : false;

  if (!provider) {
    addCheck(
      checks,
      required ? "fail" : "warn",
      "print provider choice",
      "PRINT_PROVIDER is not selected. Phase 1 can stay PDF-first; provider alpha needs a concrete adapter target.",
      { allowedProviders },
    );
  } else if (!isKnownProvider) {
    addCheck(
      checks,
      "fail",
      "print provider choice",
      `PRINT_PROVIDER=${provider} is not one of the supported provider candidates.`,
      { allowedProviders, provider },
    );
  } else if (required && provider === "manual_pdf") {
    addCheck(
      checks,
      "fail",
      "print provider choice",
      "Provider alpha requires a direct print API candidate, not manual_pdf.",
      { allowedProviders, provider },
    );
  } else {
    addCheck(
      checks,
      "pass",
      "print provider choice",
      `Print provider target is ${provider}.`,
      { allowedProviders, provider },
    );
  }

  addEnvGroupCheck(
    checks,
    "Print provider adapter",
    [
      "PRINT_PROVIDER_API_KEY",
      "PRINT_PROVIDER_WEBHOOK_SECRET",
      "PRINT_PROVIDER_PRODUCT_TRIP_SKU",
      "PRINT_PROVIDER_PRODUCT_YEARBOOK_SKU",
    ],
    required && provider !== "manual_pdf",
  );

  const sampleConfirmed = process.env.PRINT_PROVIDER_SAMPLE_ORDER_CONFIRMED === "1";
  addCheck(
    checks,
    sampleConfirmed ? "pass" : required ? "fail" : "warn",
    "print sample order",
    sampleConfirmed
      ? "A sample order has been marked as confirmed for the selected print provider."
      : "Provider alpha requires at least one reviewed sample order before outside print checkout.",
    {
      variable: "PRINT_PROVIDER_SAMPLE_ORDER_CONFIRMED",
    },
  );
}

function addPhaseTwoProviderChecks(checks: ReadinessCheck[], mode: string) {
  if (!shouldCheckPhaseTwoProviders(mode)) {
    addCheck(
      checks,
      "skip",
      "phase 2 provider env",
      "Commerce, email, monitoring, and direct print provider checks are skipped for local PDF-first alpha.",
      { mode },
    );
    return;
  }

  addStripeChecks(checks, shouldRequirePhaseTwoGroup(mode, "ALPHA_READINESS_REQUIRE_COMMERCE"));
  addEmailChecks(checks, shouldRequirePhaseTwoGroup(mode, "ALPHA_READINESS_REQUIRE_EMAIL"));
  addObservabilityChecks(
    checks,
    shouldRequirePhaseTwoGroup(mode, "ALPHA_READINESS_REQUIRE_OBSERVABILITY"),
  );
  addPrintProviderChecks(
    checks,
    shouldRequirePhaseTwoGroup(mode, "ALPHA_READINESS_REQUIRE_PRINT_PROVIDER"),
  );
}

function addTemplateCatalogChecks(checks: ReadinessCheck[]) {
  const catalog = listTemplateCatalog();
  const minTemplatePacks = parseMinEnv("ALPHA_READINESS_MIN_TEMPLATE_PACKS", 12);
  const minSpreadTemplates = parseMinEnv("ALPHA_READINESS_MIN_SPREAD_TEMPLATES", 64);
  const packCount = catalog.bookTemplatePacks.length;
  const spreadCount = catalog.spreadTemplates.length;

  addCheck(
    checks,
    packCount >= minTemplatePacks && spreadCount >= minSpreadTemplates ? "pass" : "fail",
    "template catalog",
    `Template catalog has ${packCount} packs and ${spreadCount} spreads.`,
    {
      minSpreadTemplates,
      minTemplatePacks,
      packCount,
      spreadCount,
    },
  );
}

async function addProjectStoreChecks(
  checks: ReadinessCheck[],
  requireProviders: boolean,
  readFileStore: boolean,
) {
  const mode = getProjectStoreMode();

  addCheck(
    checks,
    requireProviders && mode !== "supabase" ? "fail" : "pass",
    "project store mode",
    `Project store mode is ${mode}.`,
    { mode },
  );

  if (mode !== "supabase" && !readFileStore) {
    addCheck(
      checks,
      requireProviders ? "fail" : "skip",
      "project store read",
      requireProviders
        ? "Hosted alpha requires Supabase project storage."
        : "Skipped file-store read to avoid touching local test data.",
      { mode },
    );
    return null;
  }

  try {
    const projects = await readProjects();
    addCheck(
      checks,
      "pass",
      "project store read",
      mode === "supabase"
        ? "Supabase project store is readable."
        : "Local project store is readable for explicit readiness checks.",
      {
        mode,
        projectCount: projects.length,
      },
    );
    return projects;
  } catch (error) {
    addCheck(
      checks,
      "fail",
      "project store read",
      error instanceof Error ? error.message : "Project store read failed.",
    );
    return null;
  }
}

function addAuthChecks(checks: ReadinessCheck[], requireProviders: boolean) {
  const publicConfig = getPublicSupabaseAuthConfig();
  const publicAuthConfigured = Boolean(
    publicConfig.supabaseUrl && publicConfig.supabaseAnonKey,
  );
  const hasNextPublicAuth = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );

  addEnvGroupCheck(
    checks,
    "Supabase admin",
    ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_PROJECTS_TABLE"],
    requireProviders,
  );

  addCheck(
    checks,
    publicAuthConfigured ? "pass" : requireProviders ? "fail" : "warn",
    "public Supabase auth",
    publicAuthConfigured
      ? "Browser/mobile Supabase auth config is available."
      : "Browser/mobile Supabase auth config is missing.",
    {
      hasNextPublicAuth,
      hasPublicAnonKey: Boolean(publicConfig.supabaseAnonKey),
      hasPublicUrl: Boolean(publicConfig.supabaseUrl),
    },
  );

  if (publicAuthConfigured && !hasNextPublicAuth) {
    addCheck(
      checks,
      requireProviders ? "warn" : "skip",
      "Next public Supabase env",
      "Auth config is available through fallback env names; NEXT_PUBLIC_SUPABASE_* is preferred for hosted web.",
    );
  }
}

function addStorageChecks(checks: ReadinessCheck[], requireProviders: boolean) {
  const objectStorageConfigured = isObjectStorageConfigured();
  const localStorageEnabled = isLocalObjectStorageEnabled();

  addEnvGroupCheck(
    checks,
    "Object storage",
    [
      "PHOTO_STORAGE_BUCKET",
      "PHOTO_STORAGE_ENDPOINT",
      "PHOTO_STORAGE_ACCESS_KEY_ID",
      "PHOTO_STORAGE_SECRET_ACCESS_KEY",
    ],
    requireProviders,
  );

  addCheck(
    checks,
    objectStorageConfigured ? "pass" : requireProviders ? "fail" : "warn",
    "object storage client",
    objectStorageConfigured
      ? "S3-compatible object storage client is configured."
      : "S3-compatible object storage client is not configured.",
    {
      localStorageEnabled,
      objectStorageConfigured,
    },
  );

  if (requireProviders && localStorageEnabled) {
    addCheck(
      checks,
      "warn",
      "local upload fallback",
      "Local upload fallback is enabled in this runtime; hosted production should rely on object storage.",
      { localStorageEnabled },
    );
  }
}

function addWorkerChecks(
  checks: ReadinessCheck[],
  mode: string,
  requireWorker: boolean,
) {
  const worker = getAiWorkerQueueConfig();

  addCheck(
    checks,
    requireWorker && (!worker.queueEnabled || !worker.secretConfigured)
      ? "fail"
      : "pass",
    "private AI worker queue",
    worker.queueEnabled && worker.secretConfigured
      ? "Private local AI worker queue is enabled and protected by a secret."
      : "Private local AI worker queue is not enabled.",
    {
      maxAttempts: worker.maxAttempts,
      maxLeaseSeconds: worker.maxLeaseSeconds,
      minLeaseSeconds: worker.minLeaseSeconds,
      mode,
      queueEnabled: worker.queueEnabled,
      secretConfigured: worker.secretConfigured,
    },
  );

  if (process.env.LOCAL_AI_DIRECT_IN_PRODUCTION === "1") {
    addCheck(
      checks,
      requireWorker ? "fail" : "warn",
      "direct local AI production guard",
      "LOCAL_AI_DIRECT_IN_PRODUCTION is enabled; hosted alpha should queue local AI work instead.",
    );
  } else {
    addCheck(
      checks,
      "pass",
      "direct local AI production guard",
      "Hosted app will not call local Ollama directly.",
    );
  }

  if (process.env.LOCAL_AI_PROCESSOR_IN_PRODUCTION === "1") {
    addCheck(
      checks,
      "warn",
      "local AI processor production guard",
      "LOCAL_AI_PROCESSOR_IN_PRODUCTION is enabled; this should only be used for controlled private processor deployments.",
    );
  }
}

function getGenerationRunEntries(projects: Project[]) {
  return projects
    .flatMap<GenerationRunEntry>((project) =>
      (project.generationRuns ?? []).map((run) => ({
        project,
        run,
      })),
    )
    .sort((left, right) =>
      String(right.run.startedAt).localeCompare(String(left.run.startedAt)),
    );
}

function isActiveGenerationRun(run: GenerationRun) {
  return ACTIVE_RUN_STATUSES.includes(run.status);
}

function isStaleGenerationRun(run: GenerationRun) {
  if (!isActiveGenerationRun(run) || !run.workerLeaseExpiresAt) {
    return false;
  }

  return Date.parse(run.workerLeaseExpiresAt) <= Date.now();
}

function summarizeGenerationRun(entry: GenerationRunEntry | undefined) {
  if (!entry) {
    return null;
  }

  return {
    completedAt: entry.run.completedAt ?? null,
    modelNames: entry.run.modelNames,
    projectId: entry.project.id,
    projectRevision: entry.project.revision ?? 1,
    projectTitle: entry.project.title,
    qualityScore: entry.run.qualityReport?.score ?? null,
    runId: entry.run.id,
    startedAt: entry.run.startedAt,
    status: entry.run.status,
    validationWarnings: entry.run.validationWarnings.length,
    workerAttemptCount: entry.run.workerAttemptCount ?? 0,
    workerLeaseExpiresAt: entry.run.workerLeaseExpiresAt ?? null,
  };
}

function addGenerationRunChecks(
  checks: ReadinessCheck[],
  projects: Project[] | null,
  requireSavedGeneration: boolean,
) {
  if (!projects) {
    addCheck(
      checks,
      requireSavedGeneration ? "fail" : "skip",
      "AI generation queue",
      requireSavedGeneration
        ? "Project store could not be inspected for generation queue health."
        : "Generation queue read is skipped for this readiness mode.",
    );
    return;
  }

  const runs = getGenerationRunEntries(projects);
  const activeRuns = runs.filter((entry) => isActiveGenerationRun(entry.run));
  const staleRuns = activeRuns.filter((entry) => isStaleGenerationRun(entry.run));
  const savedRuns = runs.filter((entry) => entry.run.status === "saved");
  const failedRuns = runs.filter((entry) => entry.run.status === "failed");
  const latestRun = summarizeGenerationRun(runs[0]);
  const lastSavedRun = summarizeGenerationRun(savedRuns[0]);
  const queueEvidence = {
    activeRuns: activeRuns.length,
    failedRuns: failedRuns.length,
    latestRun,
    savedRuns: savedRuns.length,
    staleRuns: staleRuns.length,
    totalRuns: runs.length,
  };

  addCheck(
    checks,
    activeRuns.length || staleRuns.length ? "fail" : "pass",
    "AI generation queue",
    activeRuns.length || staleRuns.length
      ? "Generation queue has active or stale runs; wait or fail them before tester sessions."
      : "Generation queue has no active or stale runs.",
    queueEvidence,
  );

  const minQualityScore = parseMinEnv("ALPHA_READINESS_MIN_QUALITY_SCORE", 75);
  const qualityScore = lastSavedRun?.qualityScore;
  const qualityEvidence = {
    lastSavedRun,
    minQualityScore,
  };

  if (!lastSavedRun) {
    addCheck(
      checks,
      requireSavedGeneration ? "fail" : "skip",
      "AI saved generation quality",
      requireSavedGeneration
        ? "Hosted alpha requires at least one saved AI generation before inviting testers."
        : "No saved generation quality gate is required for this mode.",
      qualityEvidence,
    );
    return;
  }

  if (typeof qualityScore !== "number") {
    addCheck(
      checks,
      requireSavedGeneration ? "fail" : "warn",
      "AI saved generation quality",
      "The latest saved generation does not include a quality report.",
      qualityEvidence,
    );
    return;
  }

  addCheck(
    checks,
    qualityScore >= minQualityScore ? "pass" : "fail",
    "AI saved generation quality",
    `Latest saved generation quality score is ${qualityScore}/100.`,
    qualityEvidence,
  );
}

export async function GET(request: Request) {
  const unauthorized = authorizeReadinessRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const mode = getRequestedMode(request);
  const requireProviders =
    process.env.ALPHA_READINESS_REQUIRE_PROVIDERS === "1" ||
    mode === "hosted" ||
    mode === "provider";
  const requireWorker =
    process.env.ALPHA_READINESS_REQUIRE_WORKER === "1" ||
    mode === "hosted" ||
    mode === "provider";
  const rawRequireSavedGeneration = process.env.ALPHA_READINESS_REQUIRE_SAVED_RUN;
  const requireSavedGeneration =
    rawRequireSavedGeneration === "1" ||
    (rawRequireSavedGeneration !== "0" && requireProviders);
  const readProjectStoreForRuns =
    requireSavedGeneration ||
    process.env.ALPHA_READINESS_REQUIRE_GENERATION_QUEUE === "1";
  const checks: ReadinessCheck[] = [];

  addTemplateCatalogChecks(checks);
  addAuthChecks(checks, requireProviders);
  addStorageChecks(checks, requireProviders);
  addWorkerChecks(checks, mode, requireWorker);
  addPhaseTwoProviderChecks(checks, mode);
  const projects = await addProjectStoreChecks(
    checks,
    requireProviders,
    readProjectStoreForRuns,
  );
  addGenerationRunChecks(checks, projects, requireSavedGeneration);

  const failCount = checks.filter((check) => check.status === "fail").length;
  const warnCount = checks.filter((check) => check.status === "warn").length;

  return NextResponse.json({
    checks,
    mode,
    status: failCount ? "failed" : warnCount ? "warning" : "passed",
    totals: {
      fail: failCount,
      pass: checks.filter((check) => check.status === "pass").length,
      skip: checks.filter((check) => check.status === "skip").length,
      warn: warnCount,
    },
  });
}
