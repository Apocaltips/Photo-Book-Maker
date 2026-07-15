/* global console, process */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sourceDataDir = process.env.AI_ALPHA_BENCHMARK_SOURCE_DATA_DIR
  ? resolve(process.env.AI_ALPHA_BENCHMARK_SOURCE_DATA_DIR)
  : join(process.cwd(), "data");
const sourceProjectsPath = join(sourceDataDir, "projects.json");
const reportPath =
  process.env.AI_ALPHA_BENCHMARK_REPORT_PATH ??
  process.env.AI_GENERATION_REPORT_PATH ??
  join(tmpdir(), `photo-book-local-ai-alpha-benchmark-${Date.now()}.json`);
const summaryReportPath =
  process.env.AI_ALPHA_BENCHMARK_SUMMARY_REPORT_PATH ??
  process.env.AI_BENCHMARK_SUMMARY_REPORT_PATH ??
  getCompanionReportPath(reportPath, "summary");

function parseList(value) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getCompanionReportPath(targetReportPath, suffix) {
  const extension = extname(targetReportPath) || ".json";
  const basePath = targetReportPath.endsWith(extension)
    ? targetReportPath.slice(0, -extension.length)
    : targetReportPath;

  return `${basePath}-${suffix}${extension}`;
}

function getProjects(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.projects)) {
    return payload.projects;
  }

  throw new Error(`Project store has an unsupported shape: ${sourceProjectsPath}`);
}

function getApprovedPhotoCount(project) {
  return (project.photos ?? []).filter((photo) => photo.approved).length;
}

function findProjectById(projects, projectId, label) {
  const match = projects.find((project) => project.id === projectId);
  if (!match) {
    throw new Error(`${label} project was not found: ${projectId}`);
  }

  return match;
}

function findSmallProject(projects) {
  const explicitId = process.env.AI_ALPHA_BENCHMARK_SMALL_PROJECT_ID;
  if (explicitId) {
    return findProjectById(projects, explicitId, "Small alpha benchmark");
  }

  return projects
    .filter((project) => {
      const approvedCount = getApprovedPhotoCount(project);
      return approvedCount >= 6 && approvedCount <= 25;
    })
    .sort((left, right) => {
      const leftTitle = `${left.title ?? ""} ${left.subtitle ?? ""}`.toLowerCase();
      const rightTitle = `${right.title ?? ""} ${right.subtitle ?? ""}`.toLowerCase();
      const leftCapCana = /cap\s+cana/.test(leftTitle) ? 1 : 0;
      const rightCapCana = /cap\s+cana/.test(rightTitle) ? 1 : 0;

      return (
        rightCapCana - leftCapCana ||
        getApprovedPhotoCount(right) - getApprovedPhotoCount(left) ||
        String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""))
      );
    })[0];
}

function findSixtyPhotoProject(projects) {
  const explicitId = process.env.AI_ALPHA_BENCHMARK_60_PROJECT_ID;
  if (explicitId) {
    return findProjectById(projects, explicitId, "60-photo alpha benchmark");
  }

  return projects
    .filter((project) => {
      const approvedCount = getApprovedPhotoCount(project);
      return approvedCount >= 50 && approvedCount <= 70;
    })
    .sort((left, right) => {
      const leftTitle = `${left.title ?? ""} ${left.subtitle ?? ""}`.toLowerCase();
      const rightTitle = `${right.title ?? ""} ${right.subtitle ?? ""}`.toLowerCase();
      const leftNamedFixture = /60|madeira|photo\s+trip/.test(leftTitle) ? 1 : 0;
      const rightNamedFixture = /60|madeira|photo\s+trip/.test(rightTitle) ? 1 : 0;

      return (
        rightNamedFixture - leftNamedFixture ||
        Math.abs(60 - getApprovedPhotoCount(left)) - Math.abs(60 - getApprovedPhotoCount(right)) ||
        String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""))
      );
    })[0];
}

function assertProjectReady(project, label) {
  if (!project?.id) {
    throw new Error(`${label} benchmark project is missing.`);
  }

  if (getApprovedPhotoCount(project) < 6) {
    throw new Error(`${label} benchmark project has too few approved photos: ${project.id}`);
  }
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

function assertSummary(summary, targetIds) {
  const reports = summary.reports ?? [];
  if (reports.length !== targetIds.length) {
    throw new Error(
      `Alpha benchmark expected ${targetIds.length} report(s), but found ${reports.length}.`,
    );
  }

  const failures = [];
  for (const report of reports) {
    if (!report.qualityGate?.passed) {
      failures.push(
        `${report.projectId ?? report.projectTitle ?? "unknown project"} failed quality gate`,
      );
    }
    if (report.generation?.deterministicFallbackUsed) {
      failures.push(
        `${report.projectId ?? report.projectTitle ?? "unknown project"} used deterministic fallback`,
      );
    }
  }

  if (failures.length) {
    throw new Error(`Alpha benchmark failed:\n- ${failures.join("\n- ")}`);
  }
}

const explicitTargetIds = parseList(process.env.AI_BENCHMARK_PROJECT_IDS);
let targetIds = explicitTargetIds;
let selectedProjects = [];

if (!targetIds.length) {
  const payload = JSON.parse(await readFile(sourceProjectsPath, "utf8"));
  const projects = getProjects(payload);
  const smallProject = findSmallProject(projects);
  const sixtyPhotoProject = findSixtyPhotoProject(projects);

  assertProjectReady(smallProject, "Small");
  assertProjectReady(sixtyPhotoProject, "60-photo");

  selectedProjects = [smallProject, sixtyPhotoProject];
  targetIds = selectedProjects.map((project) => project.id);
}

console.log(
  JSON.stringify(
    {
      reportPath,
      selectedProjects: selectedProjects.map((project) => ({
        approvedPhotoCount: getApprovedPhotoCount(project),
        id: project.id,
        title: project.title,
      })),
      sourceDataDir,
      status: "starting local AI alpha benchmark",
      summaryReportPath,
      targetIds,
    },
    null,
    2,
  ),
);

await runNode("local-ai-benchmark.mjs", {
  AI_BENCHMARK_PROJECT_IDS: targetIds.join(","),
  AI_BENCHMARK_SOURCE_DATA_DIR: sourceDataDir,
  AI_BENCHMARK_SUMMARY_REPORT_PATH: summaryReportPath,
  AI_GENERATION_REPORT_PATH: reportPath,
  LOCAL_AI_HEALTH_REQUIRE_SAVED_RUN: process.env.LOCAL_AI_HEALTH_REQUIRE_SAVED_RUN ?? "0",
});

const summary = JSON.parse(await readFile(summaryReportPath, "utf8"));
assertSummary(summary, targetIds);
console.log(
  JSON.stringify(
    {
      reportPath,
      reports: summary.reports?.map((report) => ({
        generationPassed: report.generation?.qualityGate?.passed ?? null,
        plannerMode: report.generation?.plannerMode ?? null,
        proofPassed: report.proof?.passed ?? null,
        projectId: report.projectId,
        qualityGatePassed: report.qualityGate?.passed ?? null,
        qualityScore: report.generation?.qualityScore ?? null,
        usedPhotoPercent: report.generation?.usedPhotoPercent ?? null,
      })),
      status: "local AI alpha benchmark passed",
      summaryReportPath,
    },
    null,
    2,
  ),
);
