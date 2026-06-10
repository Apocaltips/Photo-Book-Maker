/* global URL, console */
import { readFile } from "node:fs/promises";
import {
  ALLOWED_PRINT_PROVIDERS,
  MIN_HOSTED_SHARED_SECRET_LENGTH,
  collectPhaseTwoProviderChecks,
  getReadinessContractEnvNames,
  makeSharedSecretStrengthCheck,
  shouldCheckPhaseTwoProviders,
  shouldRequirePrivateWorker,
  shouldRequireProviderInfrastructure,
} from "../src/lib/alpha-readiness-contract.js";

const envExampleUrl = new URL("../../../.env.example", import.meta.url);
const supabaseSchemaUrl = new URL("../../../docs/supabase-photo-book-schema.sql", import.meta.url);
const alphaReadinessRouteUrl = new URL(
  "../src/app/api/alpha/readiness/route.ts",
  import.meta.url,
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getEnvExampleKeys(source) {
  const keys = new Set();

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    keys.add(trimmed.slice(0, trimmed.indexOf("=")));
  }

  return keys;
}

function getCheck(checks, name) {
  const check = checks.find((entry) => entry.name === name);
  assert(check, `Missing readiness check: ${name}`);
  return check;
}

function assertStatus(checks, name, status) {
  const check = getCheck(checks, name);
  assert(
    check.status === status,
    `${name} expected status ${status}, received ${check.status}: ${check.detail}`,
  );
}

function normalizeSql(source) {
  return source.toLowerCase().replace(/\s+/g, " ").trim();
}

function assertSqlContains(sql, expected) {
  const normalizedExpected = normalizeSql(expected);
  assert(
    sql.includes(normalizedExpected),
    `Supabase schema must include: ${normalizedExpected}`,
  );
}

const envExample = await readFile(envExampleUrl, "utf8");
const supabaseSchema = normalizeSql(await readFile(supabaseSchemaUrl, "utf8"));
const alphaReadinessRoute = await readFile(alphaReadinessRouteUrl, "utf8");
const envKeys = getEnvExampleKeys(envExample);
const missingEnvExampleKeys = getReadinessContractEnvNames().filter((key) => !envKeys.has(key));

assert(
  !missingEnvExampleKeys.length,
  `.env.example is missing readiness contract variable(s): ${missingEnvExampleKeys.join(", ")}`,
);

assert(
  ALLOWED_PRINT_PROVIDERS.includes("manual_pdf") && ALLOWED_PRINT_PROVIDERS.includes("peecho"),
  "Allowed print providers must include Phase 1 manual_pdf and a direct print candidate.",
);
assertSqlContains(
  supabaseSchema,
  "alter table public.photo_book_projects enable row level security",
);
assertSqlContains(
  supabaseSchema,
  "alter table public.photo_book_projects force row level security",
);
assertSqlContains(supabaseSchema, "revoke all on table public.photo_book_projects from anon");
assertSqlContains(
  supabaseSchema,
  "revoke all on table public.photo_book_projects from authenticated",
);
assertSqlContains(
  supabaseSchema,
  "grant select, insert, update, delete on table public.photo_book_projects to service_role",
);
assertSqlContains(
  supabaseSchema,
  "revoke execute on function public.touch_photo_book_project_updated_at() from anon",
);
assertSqlContains(
  supabaseSchema,
  "revoke execute on function public.touch_photo_book_project_updated_at() from authenticated",
);
assert(
  alphaReadinessRoute.includes("direct Supabase project table access"),
  "Alpha readiness route must include the direct Supabase project table access probe.",
);
assert(
  alphaReadinessRoute.includes("isDirectAccessDenied"),
  "Alpha readiness route must fail closed unless the anon direct-access probe is denied.",
);
assert(
  alphaReadinessRoute.includes("photo upload ticket signing"),
  "Alpha readiness route must prove object storage can mint a photo upload ticket.",
);
assert(
  alphaReadinessRoute.includes("alpha readiness secret strength"),
  "Alpha readiness route must report readiness shared-secret strength.",
);
assert(
  alphaReadinessRoute.includes("private AI worker secret strength"),
  "Alpha readiness route must report private worker shared-secret strength.",
);

assert(!shouldRequireProviderInfrastructure("local", {}), "local mode must not require providers");
assert(shouldRequireProviderInfrastructure("hosted", {}), "hosted mode must require providers");
assert(shouldRequireProviderInfrastructure("provider", {}), "provider mode must require providers");
assert(!shouldRequirePrivateWorker("local", {}), "local mode must not require a private worker");
assert(shouldRequirePrivateWorker("hosted", {}), "hosted mode must require a private worker");
assert(!shouldCheckPhaseTwoProviders("local", {}), "local mode must skip Phase 2 providers");
assert(shouldCheckPhaseTwoProviders("hosted", {}), "hosted mode must warn on Phase 2 providers");
assert(shouldCheckPhaseTwoProviders("provider", {}), "provider mode must require Phase 2 providers");

const missingLocalReadinessSecretCheck = makeSharedSecretStrengthCheck({
  label: "Alpha readiness secret",
  name: "alpha readiness secret strength",
  required: false,
  value: "",
  variable: "ALPHA_READINESS_SECRET",
});
assert(
  missingLocalReadinessSecretCheck.status === "skip",
  "Optional local readiness secret strength must skip when no secret is configured.",
);

const shortHostedReadinessSecretCheck = makeSharedSecretStrengthCheck({
  label: "Alpha readiness secret",
  name: "alpha readiness secret strength",
  required: true,
  value: "short-secret",
  variable: "ALPHA_READINESS_SECRET",
});
assert(
  shortHostedReadinessSecretCheck.status === "fail",
  "Hosted readiness secret strength must fail short shared secrets.",
);
assert(
  shortHostedReadinessSecretCheck.evidence?.minLength === MIN_HOSTED_SHARED_SECRET_LENGTH,
  "Hosted readiness secret strength evidence must include the minimum length.",
);

const placeholderWorkerSecretCheck = makeSharedSecretStrengthCheck({
  label: "Private AI worker secret",
  name: "private AI worker secret strength",
  required: true,
  value: "same-readiness-secret-as-hosted",
  variable: "LOCAL_AI_WORKER_SECRET",
});
assert(
  placeholderWorkerSecretCheck.status === "fail",
  "Private worker secret strength must fail placeholder-looking secrets.",
);

const strongWorkerSecretCheck = makeSharedSecretStrengthCheck({
  label: "Private AI worker secret",
  name: "private AI worker secret strength",
  required: true,
  value: "photo-book-alpha-worker-2026-very-long-random-secret",
  variable: "LOCAL_AI_WORKER_SECRET",
});
assert(
  strongWorkerSecretCheck.status === "pass",
  "Private worker secret strength must pass long non-placeholder secrets.",
);

const localChecks = collectPhaseTwoProviderChecks({
  env: {},
  mode: "local",
});
assertStatus(localChecks, "phase 2 provider env", "skip");

const hostedChecks = collectPhaseTwoProviderChecks({
  env: {},
  mode: "hosted",
});
assertStatus(hostedChecks, "Stripe checkout env", "warn");
assertStatus(hostedChecks, "transactional email provider", "warn");
assertStatus(hostedChecks, "Sentry observability", "warn");
assertStatus(hostedChecks, "print provider choice", "warn");

const providerManualPdfChecks = collectPhaseTwoProviderChecks({
  env: {
    PRINT_PROVIDER: "manual_pdf",
  },
  mode: "provider",
});
assertStatus(providerManualPdfChecks, "Stripe checkout env", "fail");
assertStatus(providerManualPdfChecks, "print provider choice", "fail");
assertStatus(providerManualPdfChecks, "print sample order", "fail");

const providerInvalidChecks = collectPhaseTwoProviderChecks({
  env: {
    PRINT_PROVIDER: "unknown_vendor",
  },
  mode: "provider",
});
assertStatus(providerInvalidChecks, "print provider choice", "fail");

const providerConfiguredChecks = collectPhaseTwoProviderChecks({
  env: {
    NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
    NEXT_PUBLIC_POSTHOG_KEY: "posthog-key",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test",
    PRINT_PROVIDER: "peecho",
    PRINT_PROVIDER_API_KEY: "print-key",
    PRINT_PROVIDER_PRODUCT_TRIP_SKU: "trip-sku",
    PRINT_PROVIDER_PRODUCT_YEARBOOK_SKU: "yearbook-sku",
    PRINT_PROVIDER_SAMPLE_ORDER_CONFIRMED: "1",
    PRINT_PROVIDER_WEBHOOK_SECRET: "print-webhook",
    RESEND_API_KEY: "resend-key",
    SENTRY_DSN: "https://sentry.example",
    STRIPE_PRICE_TRIP_BOOK_ID: "price_trip",
    STRIPE_PRICE_YEARBOOK_ID: "price_yearbook",
    STRIPE_SECRET_KEY: "sk_test",
    STRIPE_WEBHOOK_SECRET: "whsec",
    TRANSACTIONAL_EMAIL_FROM: "Photo Book Maker <hello@example.com>",
  },
  mode: "provider",
});
const failedConfiguredChecks = providerConfiguredChecks.filter((check) => check.status === "fail");
assert(
  !failedConfiguredChecks.length,
  `Fully configured provider env should not fail: ${JSON.stringify(failedConfiguredChecks, null, 2)}`,
);

console.log("readiness contract smoke passed");
