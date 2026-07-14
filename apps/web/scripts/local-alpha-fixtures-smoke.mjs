/* global console */

import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareLocalAlphaFixtureStore } from "./lib/local-alpha-fixtures.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const fixtureDir = await mkdtemp(join(tmpdir(), "photo-book-local-alpha-fixtures-smoke-"));

try {
  await prepareLocalAlphaFixtureStore(fixtureDir);
  const projects = JSON.parse(await readFile(join(fixtureDir, "projects.json"), "utf8"));
  const approvedCounts = projects
    .map((project) => project.photos.filter((photo) => photo.approved).length)
    .sort((left, right) => left - right);

  assert(projects.length === 2, `Expected two fixture projects, received ${projects.length}.`);
  assert(
    JSON.stringify(approvedCounts) === JSON.stringify([13, 60]),
    `Expected 13-photo and 60-photo fixture projects, received ${approvedCounts.join(", ")}.`,
  );

  for (const project of projects) {
    assert(
      !project.generationRuns?.length,
      `Fixture project ${project.id} must not contain a pre-saved generation result.`,
    );

    for (const photo of project.photos) {
      assert(
        photo.storagePath?.startsWith(`local-uploads/${project.id}/`),
        `Photo ${photo.id} is missing its project-scoped storage path.`,
      );
      const filePath = join(fixtureDir, ...photo.storagePath.split("/"));
      await access(filePath);
      assert((await stat(filePath)).size > 0, `Photo fixture is empty: ${photo.storagePath}`);
    }
  }

  console.log("local alpha fixture smoke passed");
} finally {
  await rm(fixtureDir, { force: true, recursive: true });
}
