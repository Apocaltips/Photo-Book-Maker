import { listTemplateCatalog } from "@photo-book-maker/core";
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
) {
  const mode = getProjectStoreMode();

  addCheck(
    checks,
    requireProviders && mode !== "supabase" ? "fail" : "pass",
    "project store mode",
    `Project store mode is ${mode}.`,
    { mode },
  );

  if (mode !== "supabase") {
    addCheck(
      checks,
      requireProviders ? "fail" : "skip",
      "project store read",
      requireProviders
        ? "Hosted alpha requires Supabase project storage."
        : "Skipped file-store read to avoid touching local test data.",
      { mode },
    );
    return;
  }

  try {
    const projects = await readProjects();
    addCheck(checks, "pass", "project store read", "Supabase project store is readable.", {
      projectCount: projects.length,
    });
  } catch (error) {
    addCheck(
      checks,
      "fail",
      "project store read",
      error instanceof Error ? error.message : "Project store read failed.",
    );
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
  const checks: ReadinessCheck[] = [];

  addTemplateCatalogChecks(checks);
  addAuthChecks(checks, requireProviders);
  addStorageChecks(checks, requireProviders);
  addWorkerChecks(checks, mode, requireWorker);
  await addProjectStoreChecks(checks, requireProviders);

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
