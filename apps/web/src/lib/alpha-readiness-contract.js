export const ALLOWED_PRINT_PROVIDERS = Object.freeze([
  "manual_pdf",
  "peecho",
  "prodigi",
  "cloudprinter",
  "rpi_blurb",
  "lulu",
  "gelato",
]);

export const MIN_HOSTED_SHARED_SECRET_LENGTH = 24;

const PLACEHOLDER_SECRET_PATTERNS = Object.freeze([
  /^change[-_ ]?me$/i,
  /^dev[-_ ]?secret$/i,
  /^example$/i,
  /^local[-_ ]?secret$/i,
  /^password$/i,
  /^same[-_ ]?(readiness[-_ ]?)?secret[-_ ]?as[-_ ]?hosted$/i,
  /^secret$/i,
  /^test[-_ ]?secret$/i,
  /^worker[-_ ]?secret$/i,
  /^long[-_ ]?random[-_ ]?(readiness[-_ ]?)?secret$/i,
  /^your[-_ ].+/i,
  /placeholder/i,
  /replace[-_ ]?me/i,
]);

export const READINESS_ENV_GROUPS = Object.freeze({
  objectStorage: Object.freeze([
    "PHOTO_STORAGE_BUCKET",
    "PHOTO_STORAGE_ENDPOINT",
    "PHOTO_STORAGE_ACCESS_KEY_ID",
    "PHOTO_STORAGE_SECRET_ACCESS_KEY",
  ]),
  observabilityPostHog: Object.freeze(["NEXT_PUBLIC_POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_HOST"]),
  observabilitySentry: Object.freeze(["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"]),
  printProviderAdapter: Object.freeze([
    "PRINT_PROVIDER_API_KEY",
    "PRINT_PROVIDER_WEBHOOK_SECRET",
    "PRINT_PROVIDER_PRODUCT_TRIP_SKU",
    "PRINT_PROVIDER_PRODUCT_YEARBOOK_SKU",
  ]),
  printProviderChoice: Object.freeze(["PRINT_PROVIDER"]),
  printProviderSampleOrder: Object.freeze(["PRINT_PROVIDER_SAMPLE_ORDER_CONFIRMED"]),
  privateAiWorker: Object.freeze([
    "LOCAL_AI_WORKER_ENABLED",
    "LOCAL_AI_WORKER_SECRET",
    "LOCAL_AI_WORKER_HOSTED_BASE_URL",
    "LOCAL_AI_WORKER_PROCESSOR_BASE_URL",
  ]),
  stripeCheckout: Object.freeze([
    "STRIPE_SECRET_KEY",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ]),
  stripeProductPrices: Object.freeze(["STRIPE_PRICE_TRIP_BOOK_ID", "STRIPE_PRICE_YEARBOOK_ID"]),
  supabaseAdmin: Object.freeze(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_PROJECTS_TABLE"]),
  supabasePublic: Object.freeze(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]),
  transactionalEmailProviders: Object.freeze(["RESEND_API_KEY", "POSTMARK_SERVER_TOKEN"]),
  transactionalEmailSender: Object.freeze(["TRANSACTIONAL_EMAIL_FROM"]),
});

export const READINESS_CONTROL_ENV_NAMES = Object.freeze([
  "ALPHA_READINESS_BASE_URL",
  "ALPHA_READINESS_CHECK_CALLER_ENV",
  "ALPHA_READINESS_EXPECT_AUTH_REQUIRED",
  "ALPHA_READINESS_MIN_QUALITY_SCORE",
  "ALPHA_READINESS_MIN_SPREAD_TEMPLATES",
  "ALPHA_READINESS_MIN_TEMPLATE_PACKS",
  "ALPHA_READINESS_MODE",
  "ALPHA_READINESS_REPORT_PATH",
  "ALPHA_READINESS_REQUIRE_AI_HEALTH",
  "ALPHA_READINESS_REQUIRE_COMMERCE",
  "ALPHA_READINESS_REQUIRE_EMAIL",
  "ALPHA_READINESS_REQUIRE_GENERATION_QUEUE",
  "ALPHA_READINESS_REQUIRE_OBSERVABILITY",
  "ALPHA_READINESS_REQUIRE_PRINT_PROVIDER",
  "ALPHA_READINESS_REQUIRE_PROVIDERS",
  "ALPHA_READINESS_REQUIRE_SAVED_RUN",
  "ALPHA_READINESS_REQUIRE_SERVER",
  "ALPHA_READINESS_REQUIRE_WORKER",
  "ALPHA_READINESS_SECRET",
  "ALPHA_READINESS_STRICT",
]);

export function hasReadinessEnvValue(env, name) {
  return Boolean(env[name]?.trim());
}

export function getSharedSecretStrengthIssue(
  value,
  { label = "Shared secret", minLength = MIN_HOSTED_SHARED_SECRET_LENGTH } = {},
) {
  const secret = String(value ?? "").trim();

  if (!secret) {
    return `${label} is missing.`;
  }

  if (secret.length < minLength) {
    return `${label} must be at least ${minLength} characters.`;
  }

  if (/^(.)\1+$/.test(secret)) {
    return `${label} cannot be one repeated character.`;
  }

  if (PLACEHOLDER_SECRET_PATTERNS.some((pattern) => pattern.test(secret))) {
    return `${label} looks like a placeholder.`;
  }

  return null;
}

export function makeSharedSecretStrengthCheck({
  label,
  minLength = MIN_HOSTED_SHARED_SECRET_LENGTH,
  name,
  required = false,
  value,
  variable,
}) {
  const secret = String(value ?? "").trim();
  const issue = getSharedSecretStrengthIssue(secret, { label, minLength });
  const evidence = {
    configured: Boolean(secret),
    length: secret.length,
    minLength,
    required,
    variable,
  };

  if (!issue) {
    return {
      detail: `${label} is configured with enough entropy for hosted alpha shared-secret auth.`,
      evidence,
      name,
      status: "pass",
    };
  }

  if (!required && !secret) {
    return {
      detail: `${label} is not required for this readiness mode.`,
      evidence,
      name,
      status: "skip",
    };
  }

  return {
    detail: issue,
    evidence,
    name,
    status: required ? "fail" : "warn",
  };
}

export function getMissingEnv(env, variables) {
  return variables.filter((variable) => !hasReadinessEnvValue(env, variable));
}

export function shouldRequireProviderInfrastructure(mode, env) {
  return env.ALPHA_READINESS_REQUIRE_PROVIDERS === "1" || mode === "hosted" || mode === "provider";
}

export function shouldRequirePrivateWorker(mode, env) {
  return env.ALPHA_READINESS_REQUIRE_WORKER === "1" || mode === "hosted" || mode === "provider";
}

export function shouldCheckPhaseTwoProviders(mode, env) {
  return (
    mode === "hosted" ||
    mode === "provider" ||
    env.ALPHA_READINESS_REQUIRE_COMMERCE === "1" ||
    env.ALPHA_READINESS_REQUIRE_EMAIL === "1" ||
    env.ALPHA_READINESS_REQUIRE_OBSERVABILITY === "1" ||
    env.ALPHA_READINESS_REQUIRE_PRINT_PROVIDER === "1"
  );
}

export function shouldRequirePhaseTwoGroup(mode, envName, env) {
  return env[envName] === "1" || mode === "provider";
}

export function makeEnvGroupCheck(name, variables, required, env) {
  const missing = getMissingEnv(env, variables);

  if (!missing.length) {
    return {
      detail: `${name} environment variables are present.`,
      evidence: {
        variables,
      },
      name: `${name} env`,
      status: "pass",
    };
  }

  return {
    detail: `${name} is missing: ${missing.join(", ")}`,
    evidence: {
      missing,
      variables,
    },
    name: `${name} env`,
    status: required ? "fail" : "warn",
  };
}

function getPrintProvider(env) {
  return env.PRINT_PROVIDER?.trim().toLowerCase() ?? "";
}

export function collectPhaseTwoProviderChecks({ mode, env }) {
  const checks = [];

  if (!shouldCheckPhaseTwoProviders(mode, env)) {
    return [
      {
        detail: "Commerce, email, monitoring, and direct print provider checks are skipped for local PDF-first alpha.",
        evidence: {
          mode,
        },
        name: "phase 2 provider env",
        status: "skip",
      },
    ];
  }

  const requireCommerce = shouldRequirePhaseTwoGroup(
    mode,
    "ALPHA_READINESS_REQUIRE_COMMERCE",
    env,
  );
  const requireEmail = shouldRequirePhaseTwoGroup(mode, "ALPHA_READINESS_REQUIRE_EMAIL", env);
  const requireObservability = shouldRequirePhaseTwoGroup(
    mode,
    "ALPHA_READINESS_REQUIRE_OBSERVABILITY",
    env,
  );
  const requirePrintProvider = shouldRequirePhaseTwoGroup(
    mode,
    "ALPHA_READINESS_REQUIRE_PRINT_PROVIDER",
    env,
  );

  checks.push(
    makeEnvGroupCheck("Stripe checkout", READINESS_ENV_GROUPS.stripeCheckout, requireCommerce, env),
    makeEnvGroupCheck(
      "Stripe product prices",
      READINESS_ENV_GROUPS.stripeProductPrices,
      requireCommerce,
      env,
    ),
  );

  const hasResend = hasReadinessEnvValue(env, "RESEND_API_KEY");
  const hasPostmark = hasReadinessEnvValue(env, "POSTMARK_SERVER_TOKEN");
  const hasSender = hasReadinessEnvValue(env, "TRANSACTIONAL_EMAIL_FROM");

  checks.push(
    {
      detail:
        hasResend || hasPostmark
          ? "A transactional email provider is configured."
          : "Configure Resend or Postmark before branded invites and order emails.",
      evidence: {
        hasPostmark,
        hasResend,
        providers: READINESS_ENV_GROUPS.transactionalEmailProviders,
      },
      name: "transactional email provider",
      status: hasResend || hasPostmark ? "pass" : requireEmail ? "fail" : "warn",
    },
    {
      detail: hasSender
        ? "Transactional email sender is configured."
        : "TRANSACTIONAL_EMAIL_FROM is required before sending branded customer email.",
      evidence: {
        variable: "TRANSACTIONAL_EMAIL_FROM",
      },
      name: "transactional email sender",
      status: hasSender ? "pass" : requireEmail ? "fail" : "warn",
    },
  );

  const hasSentry =
    hasReadinessEnvValue(env, "SENTRY_DSN") || hasReadinessEnvValue(env, "NEXT_PUBLIC_SENTRY_DSN");
  const hasPostHog = hasReadinessEnvValue(env, "NEXT_PUBLIC_POSTHOG_KEY");

  checks.push(
    {
      detail: hasSentry
        ? "Sentry is configured for runtime error visibility."
        : "Configure Sentry before provider alpha so upload, checkout, and print errors are visible.",
      evidence: {
        variables: READINESS_ENV_GROUPS.observabilitySentry,
      },
      name: "Sentry observability",
      status: hasSentry ? "pass" : requireObservability ? "fail" : "warn",
    },
    {
      detail: hasPostHog
        ? "PostHog analytics key is configured."
        : "Configure PostHog before provider alpha to measure upload-to-proof and checkout drop-off.",
      evidence: {
        variables: READINESS_ENV_GROUPS.observabilityPostHog,
      },
      name: "PostHog analytics",
      status: hasPostHog ? "pass" : requireObservability ? "fail" : "warn",
    },
  );

  const provider = getPrintProvider(env);
  const isKnownProvider = provider ? ALLOWED_PRINT_PROVIDERS.includes(provider) : false;

  if (!provider) {
    checks.push({
      detail:
        "PRINT_PROVIDER is not selected. Phase 1 can stay PDF-first; provider alpha needs a concrete adapter target.",
      evidence: {
        allowedProviders: ALLOWED_PRINT_PROVIDERS,
      },
      name: "print provider choice",
      status: requirePrintProvider ? "fail" : "warn",
    });
  } else if (!isKnownProvider) {
    checks.push({
      detail: `PRINT_PROVIDER=${provider} is not one of the supported provider candidates.`,
      evidence: {
        allowedProviders: ALLOWED_PRINT_PROVIDERS,
        provider,
      },
      name: "print provider choice",
      status: "fail",
    });
  } else if (requirePrintProvider && provider === "manual_pdf") {
    checks.push({
      detail: "Provider alpha requires a direct print API candidate, not manual_pdf.",
      evidence: {
        allowedProviders: ALLOWED_PRINT_PROVIDERS,
        provider,
      },
      name: "print provider choice",
      status: "fail",
    });
  } else {
    checks.push({
      detail: `Print provider target is ${provider}.`,
      evidence: {
        allowedProviders: ALLOWED_PRINT_PROVIDERS,
        provider,
      },
      name: "print provider choice",
      status: "pass",
    });
  }

  checks.push(
    makeEnvGroupCheck(
      "Print provider adapter",
      READINESS_ENV_GROUPS.printProviderAdapter,
      requirePrintProvider && provider !== "manual_pdf",
      env,
    ),
  );

  const sampleConfirmed = env.PRINT_PROVIDER_SAMPLE_ORDER_CONFIRMED === "1";
  checks.push({
    detail: sampleConfirmed
      ? "A sample order has been marked as confirmed for the selected print provider."
      : "Provider alpha requires at least one reviewed sample order before outside print checkout.",
    evidence: {
      variable: "PRINT_PROVIDER_SAMPLE_ORDER_CONFIRMED",
    },
    name: "print sample order",
    status: sampleConfirmed ? "pass" : requirePrintProvider ? "fail" : "warn",
  });

  return checks;
}

export function getReadinessContractEnvNames() {
  return [
    ...new Set([
      ...READINESS_CONTROL_ENV_NAMES,
      ...Object.values(READINESS_ENV_GROUPS).flat(),
      "LOCAL_AI_DIRECT_IN_PRODUCTION",
      "LOCAL_AI_PROCESSOR_IN_PRODUCTION",
      "TRIGGER_SECRET_KEY",
    ]),
  ].sort();
}
