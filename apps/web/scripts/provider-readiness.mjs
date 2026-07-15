/* global process */

process.env.ALPHA_READINESS_MODE ??= "provider";
process.env.ALPHA_READINESS_REQUIRE_SERVER ??= "1";

await import("./alpha-readiness.mjs");
