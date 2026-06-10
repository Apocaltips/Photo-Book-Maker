/* global URL, console */
import { readFile } from "node:fs/promises";
import {
  ALLOWED_PRINT_PROVIDERS,
  collectPhaseTwoProviderChecks,
  getReadinessContractEnvNames,
  shouldCheckPhaseTwoProviders,
  shouldRequirePrivateWorker,
  shouldRequireProviderInfrastructure,
} from "../src/lib/alpha-readiness-contract.js";

const envExampleUrl = new URL("../../../.env.example", import.meta.url);

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

const envExample = await readFile(envExampleUrl, "utf8");
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

assert(!shouldRequireProviderInfrastructure("local", {}), "local mode must not require providers");
assert(shouldRequireProviderInfrastructure("hosted", {}), "hosted mode must require providers");
assert(shouldRequireProviderInfrastructure("provider", {}), "provider mode must require providers");
assert(!shouldRequirePrivateWorker("local", {}), "local mode must not require a private worker");
assert(shouldRequirePrivateWorker("hosted", {}), "hosted mode must require a private worker");
assert(!shouldCheckPhaseTwoProviders("local", {}), "local mode must skip Phase 2 providers");
assert(shouldCheckPhaseTwoProviders("hosted", {}), "hosted mode must warn on Phase 2 providers");
assert(shouldCheckPhaseTwoProviders("provider", {}), "provider mode must require Phase 2 providers");

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
