/* global AbortSignal, console, fetch, process, setTimeout */

import { spawn } from "node:child_process";
import { access, copyFile, cp, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const reportPath =
  process.env.AI_GENERATION_REPORT_PATH ??
  join(tmpdir(), `photo-book-local-ai-benchmark-${Date.now()}.json`);
const isolated = process.env.AI_BENCHMARK_ISOLATED !== "0";
const port = process.env.AI_BENCHMARK_PORT ?? "3221";
const baseUrl = (process.env.AI_BENCHMARK_BASE_URL ?? `http://127.0.0.1:${port}`).replace(
  /\/$/,
  "",
);
const sourceDataDir = process.env.AI_BENCHMARK_SOURCE_DATA_DIR
  ? resolve(process.env.AI_BENCHMARK_SOURCE_DATA_DIR)
  : join(process.cwd(), "data");
const fileStoreDir = isolated
  ? await mkdtemp(join(tmpdir(), "photo-book-maker-ai-benchmark-"))
  : undefined;
let server;
let serverOutput = "";

function parseList(value) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "project";
}

function getBenchmarkTargets() {
  const targets = [
    ...parseList(process.env.AI_BENCHMARK_PROJECT_IDS).map((projectId) => ({
      projectId,
    })),
    ...parseList(process.env.AI_BENCHMARK_PROJECT_TITLES).map((projectTitle) => ({
      projectTitle,
    })),
  ];

  if (targets.length) {
    return targets;
  }

  return [
    {
      projectId: process.env.AI_GENERATION_PROJECT_ID,
      projectTitle: process.env.AI_GENERATION_PROJECT_TITLE,
    },
  ];
}

function getTargetReportPath(target, index, total) {
  if (total === 1) {
    return reportPath;
  }

  const extension = extname(reportPath) || ".json";
  const basePath = reportPath.endsWith(extension)
    ? reportPath.slice(0, -extension.length)
    : reportPath;
  const label = slugify(target.projectId ?? target.projectTitle ?? `project-${index + 1}`);

  return `${basePath}-${String(index + 1).padStart(2, "0")}-${label}${extension}`;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function prepareIsolatedStore() {
  if (!fileStoreDir) {
    return;
  }

  const sourceProjects = join(sourceDataDir, "projects.json");
  if (!(await pathExists(sourceProjects))) {
    throw new Error(`AI benchmark source project store was not found: ${sourceProjects}`);
  }

  await mkdir(fileStoreDir, { recursive: true });
  await copyFile(sourceProjects, join(fileStoreDir, "projects.json"));

  const sourceUploads = join(sourceDataDir, "local-uploads");
  if (await pathExists(sourceUploads)) {
    await cp(sourceUploads, join(fileStoreDir, "local-uploads"), {
      force: true,
      recursive: true,
    });
  }
}

async function detectExistingLocalServer() {
  try {
    const response = await fetch("http://127.0.0.1:3000", {
      signal: AbortSignal.timeout(1500),
    });
    const text = await response.text();

    return response.ok && text.includes("Photo Book Maker");
  } catch {
    return false;
  }
}

function startServer() {
  if (!isolated) {
    return undefined;
  }

  const child =
    process.platform === "win32"
      ? spawn(`npm.cmd run dev -- --hostname 127.0.0.1 --port ${port}`, {
          cwd: process.cwd(),
          env: {
            ...process.env,
            EXPO_PUBLIC_API_BASE_URL: `${baseUrl}/api`,
            NEXT_TELEMETRY_DISABLED: "1",
            NEXT_PUBLIC_API_BASE_URL: `${baseUrl}/api`,
            PHOTO_BOOK_FILE_STORE_DIR: fileStoreDir,
          },
          shell: true,
          stdio: ["ignore", "pipe", "pipe"],
        })
      : spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", port], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            EXPO_PUBLIC_API_BASE_URL: `${baseUrl}/api`,
            NEXT_TELEMETRY_DISABLED: "1",
            NEXT_PUBLIC_API_BASE_URL: `${baseUrl}/api`,
            PHOTO_BOOK_FILE_STORE_DIR: fileStoreDir,
          },
          stdio: ["ignore", "pipe", "pipe"],
        });

  child.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  return child;
}

async function fetchWithTimeout(url) {
  return fetch(url, {
    signal: AbortSignal.timeout(5000),
  });
}

async function waitForServer() {
  if (!isolated) {
    return;
  }

  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(baseUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until Next is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`AI benchmark server did not become ready.\n${serverOutput}`);
}

async function stopServer() {
  if (!server) {
    return;
  }

  if (process.platform === "win32" && server.pid) {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
        stdio: "ignore",
      });
      killer.on("exit", resolve);
      killer.on("error", resolve);
    });
    return;
  }

  server.kill("SIGTERM");
}

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

try {
  if (isolated && (await detectExistingLocalServer())) {
    throw new Error(
      [
        "A Photo Book Maker dev server is already running at http://127.0.0.1:3000.",
        "The isolated AI benchmark boots its own Next server and temp project store, but Next cannot run two dev servers for the same app directory.",
        "Stop the existing dev server and rerun, or set AI_BENCHMARK_ISOLATED=0 when you intentionally want to target the running app.",
      ].join(" "),
    );
  }

  await prepareIsolatedStore();
  server = startServer();
  await waitForServer();

  await runNode("local-ai-health.mjs", {
    LOCAL_AI_HEALTH_BASE_URL: baseUrl,
    LOCAL_AI_HEALTH_REQUIRE_SAVED_RUN:
      process.env.LOCAL_AI_HEALTH_REQUIRE_SAVED_RUN ?? "0",
  });
  const targets = getBenchmarkTargets();
  const reports = [];

  for (const [index, target] of targets.entries()) {
    const targetReportPath = getTargetReportPath(target, index, targets.length);
    const smokeEnv = {
      AI_GENERATION_ALLOW_EXISTING_STORE: isolated
        ? "1"
        : process.env.AI_GENERATION_ALLOW_EXISTING_STORE,
      AI_GENERATION_BASE_URL: baseUrl,
      AI_GENERATION_REPORT_PATH: targetReportPath,
    };
    if (target.projectId) {
      smokeEnv.AI_GENERATION_PROJECT_ID = target.projectId;
    }
    if (target.projectTitle) {
      smokeEnv.AI_GENERATION_PROJECT_TITLE = target.projectTitle;
    }

    await runNode("ai-generation-smoke.mjs", smokeEnv);
    reports.push({
      projectId: target.projectId ?? null,
      projectTitle: target.projectTitle ?? null,
      reportPath: targetReportPath,
    });
  }

  console.log(
    JSON.stringify(
      {
        isolated,
        reportPath: targets.length === 1 ? reports[0]?.reportPath ?? reportPath : null,
        reports,
        sourceDataDir: isolated ? sourceDataDir : null,
        status: "local AI benchmark passed",
        tempStoreDir: isolated ? fileStoreDir : null,
      },
      null,
      2,
    ),
  );
} finally {
  await stopServer();
  if (fileStoreDir) {
    await rm(fileStoreDir, { force: true, recursive: true });
  }
}
