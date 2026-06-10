import {
  listTemplateCatalog,
  type GenerationRun,
  type Project,
} from "@photo-book-maker/core";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  collectPhaseTwoProviderChecks,
  getMissingEnv,
  shouldRequirePrivateWorker,
  shouldRequireProviderInfrastructure,
} from "@/lib/alpha-readiness-contract";
import { getAiWorkerQueueConfig } from "@/lib/server/ai-worker-auth";
import {
  createPhotoUploadTicket,
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

type SupabaseDirectAccessProbe = {
  code?: string;
  message?: string;
  status?: number;
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

function normalizeReadinessStatus(status: unknown): ReadinessStatus {
  return status === "fail" || status === "pass" || status === "skip" || status === "warn"
    ? status
    : "fail";
}

function addEnvGroupCheck(
  checks: ReadinessCheck[],
  name: string,
  variables: string[],
  required: boolean,
) {
  const missing = getMissingEnv(process.env, variables);

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

function addPhaseTwoProviderChecks(checks: ReadinessCheck[], mode: string) {
  for (const check of collectPhaseTwoProviderChecks({ env: process.env, mode })) {
    addCheck(
      checks,
      normalizeReadinessStatus(check.status),
      check.name,
      check.detail,
      check.evidence,
    );
  }
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

function isDirectAccessDenied(error: SupabaseDirectAccessProbe | null) {
  if (!error) {
    return false;
  }

  const code = String(error.code ?? "");
  const message = String(error.message ?? "");
  return code === "42501" || /permission denied|row-level security|not allowed/i.test(message);
}

async function addSupabaseDirectAccessChecks(
  checks: ReadinessCheck[],
  requireProviders: boolean,
) {
  const publicConfig = getPublicSupabaseAuthConfig();
  const table = process.env.SUPABASE_PROJECTS_TABLE ?? "photo_book_projects";

  if (!publicConfig.supabaseUrl || !publicConfig.supabaseAnonKey) {
    addCheck(
      checks,
      requireProviders ? "fail" : "skip",
      "direct Supabase project table access",
      requireProviders
        ? "Cannot verify direct client table access because public Supabase auth env is missing."
        : "Direct Supabase table-access probe is skipped without public Supabase auth env.",
      {
        hasAnonKey: Boolean(publicConfig.supabaseAnonKey),
        hasUrl: Boolean(publicConfig.supabaseUrl),
        table,
      },
    );
    return;
  }

  const anonClient = createClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { error } = await anonClient.from(table).select("id").limit(1);

  if (isDirectAccessDenied(error)) {
    addCheck(
      checks,
      "pass",
      "direct Supabase project table access",
      "Supabase anon client cannot directly read project payload rows.",
      {
        code: error?.code ?? null,
        message: error?.message ?? null,
        table,
      },
    );
    return;
  }

  if (error) {
    addCheck(
      checks,
      "fail",
      "direct Supabase project table access",
      "Supabase direct-access probe failed for a reason other than denied table access.",
      {
        code: error.code ?? null,
        message: error.message ?? null,
        table,
      },
    );
    return;
  }

  addCheck(
    checks,
    "fail",
    "direct Supabase project table access",
    "Supabase anon client can call the project table endpoint directly; project payloads must stay behind the Next API.",
    { table },
  );
}

async function addStorageChecks(checks: ReadinessCheck[], requireProviders: boolean) {
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

  if (!objectStorageConfigured) {
    addCheck(
      checks,
      requireProviders ? "fail" : "skip",
      "photo upload ticket signing",
      requireProviders
        ? "Hosted alpha requires object storage before upload tickets can be signed."
        : "Upload ticket signing is skipped without object storage in local PDF-first mode.",
      {
        localStorageEnabled,
        objectStorageConfigured,
      },
    );
    return;
  }

  try {
    const upload = await createPhotoUploadTicket({
      contentType: "image/jpeg",
      fileName: "alpha-readiness-photo.jpg",
      projectId: "alpha-readiness-probe",
    });
    const isRemoteProjectPath = upload.storagePath.startsWith("projects/alpha-readiness-probe/");
    const hasSignedUrls = upload.uploadUrl.startsWith("http") && upload.downloadUrl.startsWith("http");

    addCheck(
      checks,
      isRemoteProjectPath && hasSignedUrls ? "pass" : "fail",
      "photo upload ticket signing",
      isRemoteProjectPath && hasSignedUrls
        ? "Object storage can mint a signed photo upload ticket without writing data."
        : "Object storage upload ticket shape is invalid.",
      {
        contentType: upload.contentType,
        expiresInSeconds: upload.expiresInSeconds,
        hasDownloadUrl: Boolean(upload.downloadUrl),
        hasUploadUrl: Boolean(upload.uploadUrl),
        storagePathPrefix: upload.storagePath.split("/").slice(0, 2).join("/"),
      },
    );
  } catch (error) {
    addCheck(
      checks,
      "fail",
      "photo upload ticket signing",
      error instanceof Error ? error.message : "Unable to create an object-storage upload ticket.",
      {
        objectStorageConfigured,
      },
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
  const requireProviders = shouldRequireProviderInfrastructure(mode, process.env);
  const requireWorker = shouldRequirePrivateWorker(mode, process.env);
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
  await addSupabaseDirectAccessChecks(checks, requireProviders);
  await addStorageChecks(checks, requireProviders);
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
