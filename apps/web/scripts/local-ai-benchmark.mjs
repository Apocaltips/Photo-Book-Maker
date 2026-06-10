/* global console, process */

import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const reportPath =
  process.env.AI_GENERATION_REPORT_PATH ??
  join(tmpdir(), `photo-book-local-ai-benchmark-${Date.now()}.json`);

function runNode(scriptName, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(scriptDir, scriptName)], {
      env: {
        ...process.env,
        ...env,
      },
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${scriptName} exited with code ${code ?? "unknown"}.`));
      }
    });
  });
}

await runNode("local-ai-health.mjs", {
  LOCAL_AI_HEALTH_REQUIRE_SAVED_RUN:
    process.env.LOCAL_AI_HEALTH_REQUIRE_SAVED_RUN ?? "0",
});
await runNode("ai-generation-smoke.mjs", {
  AI_GENERATION_REPORT_PATH: reportPath,
});

console.log(
  JSON.stringify(
    {
      reportPath,
      status: "local AI benchmark passed",
    },
    null,
    2,
  ),
);
