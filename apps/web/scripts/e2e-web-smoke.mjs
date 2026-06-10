/* global AbortSignal, Buffer, console, fetch, process, setTimeout */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const port = process.env.E2E_WEB_PORT ?? "3210";
const defaultBaseUrl = `http://127.0.0.1:${port}`;
const allowExistingServer =
  Boolean(process.env.E2E_WEB_BASE_URL) || process.env.E2E_WEB_REUSE_EXISTING === "1";
const existingBaseUrl = await detectExistingBaseUrl();
if (existingBaseUrl && !allowExistingServer) {
  console.error(
    [
      `A Photo Book Maker dev server is already running at ${existingBaseUrl}.`,
      "The default E2E smoke uses an isolated temp project store, but Next cannot boot a second dev server for this app directory while the first one is active.",
      "Stop the existing dev server and rerun npm run test:e2e:web, or explicitly set E2E_WEB_REUSE_EXISTING=1 when you accept that the smoke will target the running app store.",
    ].join(" "),
  );
  process.exit(1);
}
const detectedExistingBaseUrl = allowExistingServer ? existingBaseUrl : undefined;
const baseUrl = (process.env.E2E_WEB_BASE_URL ?? detectedExistingBaseUrl ?? defaultBaseUrl).replace(
  /\/$/,
  "",
);
const reuseExistingServer = Boolean(process.env.E2E_WEB_BASE_URL || detectedExistingBaseUrl);
const fileStoreDir = reuseExistingServer
  ? undefined
  : await mkdtemp(path.join(tmpdir(), "photo-book-maker-e2e-"));
const devAuthHeaders = {
  "X-Photo-Book-Dev-Email": "android-tester@example.com",
  "X-Photo-Book-Dev-Id": "android-tester",
  "X-Photo-Book-Dev-Name": "Android Tester",
};
const workerSecret = "photo-book-e2e-worker-secret";
const otherDevAuthHeaders = {
  "X-Photo-Book-Dev-Email": "family-friend@example.com",
  "X-Photo-Book-Dev-Id": "family-friend",
  "X-Photo-Book-Dev-Name": "Family Friend",
};

async function detectExistingBaseUrl() {
  if (process.env.E2E_WEB_BASE_URL) {
    return undefined;
  }

  try {
    const response = await fetch("http://127.0.0.1:3000", {
      signal: AbortSignal.timeout(1_500),
    });
    const text = await response.text();

    if (response.ok && text.includes("Photo Book Maker")) {
      return "http://127.0.0.1:3000";
    }
  } catch {
    // No reusable local app server is running.
  }

  return undefined;
}
const server = reuseExistingServer
  ? undefined
  : process.platform === "win32"
    ? spawn(`npm.cmd run dev -- --hostname 127.0.0.1 --port ${port}`, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          EXPO_PUBLIC_API_BASE_URL: `${baseUrl}/api`,
          NEXT_TELEMETRY_DISABLED: "1",
          NEXT_PUBLIC_API_BASE_URL: `${baseUrl}/api`,
          PHOTO_BOOK_FILE_STORE_DIR: fileStoreDir,
          LOCAL_AI_WORKER_ENABLED: "1",
          LOCAL_AI_WORKER_SECRET: workerSecret,
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
          LOCAL_AI_WORKER_ENABLED: "1",
          LOCAL_AI_WORKER_SECRET: workerSecret,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

let serverOutput = "";
server?.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server?.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

async function fetchWithTimeout(url, init) {
  let lastError;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(5_000),
      });
    } catch (error) {
      lastError = error;
      const code = error?.cause?.code ?? error?.code;
      const isRetryable =
        code === "ECONNRESET" ||
        code === "ECONNREFUSED" ||
        code === "ETIMEDOUT" ||
        error?.name === "TimeoutError";

      if (!isRetryable || attempt === 3) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }

  throw lastError;
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

async function waitForServer() {
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

  throw new Error(`Next dev server did not become ready.\n${serverOutput}`);
}

async function assertRoute(path, predicate, label) {
  const response = await fetchWithTimeout(`${baseUrl}${path}`);
  const text = await response.text();

  if (!predicate(response, text)) {
    throw new Error(`${label} failed for ${path}: ${response.status}\n${text.slice(0, 500)}`);
  }
}

async function apiJson(path, init = {}) {
  const response = await fetchWithTimeout(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...devAuthHeaders,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`API call failed ${path}: ${response.status}\n${JSON.stringify(body)}`);
  }

  return body;
}

async function workerApiJson(path, init = {}) {
  const response = await fetchWithTimeout(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${workerSecret}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Worker API call failed ${path}: ${response.status}\n${JSON.stringify(body)}`);
  }

  return body;
}

async function runProjectE2E() {
  const stamp = Date.now();
  let project = (
    await apiJson("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        endDate: "2026-07-14",
        startDate: "2026-07-11",
        subtitle: "Automated Android/web local E2E",
        timezone: "America/Denver",
        title: `Android E2E ${stamp}`,
        type: "trip",
      }),
    })
  ).project;

  if (!project?.id || project.revision !== 1) {
    throw new Error("Project creation did not return a revisioned project.");
  }

  const forbiddenProjectResponse = await fetchWithTimeout(`${baseUrl}/api/projects/${project.id}`, {
    headers: otherDevAuthHeaders,
  });
  if (forbiddenProjectResponse.status !== 403) {
    throw new Error(
      `Cross-account project access was not blocked: ${forbiddenProjectResponse.status}`,
    );
  }

  const otherProjectList = await fetchWithTimeout(`${baseUrl}/api/projects`, {
    headers: otherDevAuthHeaders,
  });
  const otherProjectListBody = await otherProjectList.json();
  if (
    !otherProjectList.ok ||
    otherProjectListBody.projects?.some((entry) => entry.id === project.id)
  ) {
    throw new Error("Cross-account project list leaked another user's project.");
  }

  await assertRoute(
    `/projects/${project.id}`,
    (response) => response.ok,
    "project board route smoke",
  );

  const generationQuestions = await apiJson(`/api/projects/${project.id}/generation/questions`);
  const expectedQuestionIds = [
    "tripPurpose",
    "audience",
    "bookSize",
    "mustIncludeMoments",
    "coverPreference",
    "namesPrivacy",
    "mapMemorabiliaPreference",
    "captionDepth",
    "density",
    "tone",
  ];
  const questionIds = new Set(
    generationQuestions.questionnaire?.questions?.map((question) => question.id) ?? [],
  );
  if (
    generationQuestions.revision !== project.revision ||
    !generationQuestions.questionnaire?.questions?.length ||
    !generationQuestions.questionnaire?.answers?.tripPurpose ||
    expectedQuestionIds.some((questionId) => !questionIds.has(questionId))
  ) {
    throw new Error("Generation questionnaire route did not return usable defaults.");
  }

  const queuedGeneration = await apiJson(`/api/projects/${project.id}/generation/run`, {
    method: "POST",
    body: JSON.stringify({
      expectedRevision: project.revision,
      questionnaire: generationQuestions.questionnaire.answers,
    }),
  });
  project = queuedGeneration.project;
  if (
    queuedGeneration.run?.status !== "queued" ||
    !queuedGeneration.run?.progress?.some((entry) => entry.includes("private local AI worker"))
  ) {
    throw new Error("Worker-enabled generation route did not queue a worker job.");
  }

  const unauthorizedClaim = await fetchWithTimeout(`${baseUrl}/api/ai/worker/generation/claim`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workerId: "unauthorized-e2e-worker",
    }),
  });
  if (unauthorizedClaim.status !== 401) {
    throw new Error(`Worker claim route did not reject missing secret: ${unauthorizedClaim.status}`);
  }

  const claimed = await workerApiJson("/api/ai/worker/generation/claim", {
    method: "POST",
    body: JSON.stringify({
      workerId: "e2e-worker",
    }),
  });
  if (claimed.job?.runId !== queuedGeneration.run.id || claimed.job?.workerId !== "e2e-worker") {
    throw new Error("Worker claim route did not return the queued generation job.");
  }

  const secondClaim = await workerApiJson("/api/ai/worker/generation/claim", {
    method: "POST",
    body: JSON.stringify({
      workerId: "e2e-worker-two",
    }),
  });
  if (secondClaim.job) {
    throw new Error("Worker claim route allowed a second worker to claim the active run.");
  }

  const staleHeartbeat = await fetchWithTimeout(
    `${baseUrl}/api/ai/worker/generation/heartbeat`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${workerSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId: claimed.job.projectId,
        runId: claimed.job.runId,
        workerId: "stale-e2e-worker",
      }),
    },
  );
  if (staleHeartbeat.status !== 409) {
    throw new Error(`Worker heartbeat did not reject a stale worker: ${staleHeartbeat.status}`);
  }

  const heartbeat = await workerApiJson("/api/ai/worker/generation/heartbeat", {
    method: "POST",
    body: JSON.stringify({
      projectId: claimed.job.projectId,
      runId: claimed.job.runId,
      workerId: "e2e-worker",
    }),
  });
  if (heartbeat.run?.workerId !== "e2e-worker" || !heartbeat.run?.workerHeartbeatAt) {
    throw new Error("Worker heartbeat did not refresh claimed run state.");
  }

  const completedByStaleWorker = {
    ...claimed.job.project,
    generationRuns: [
      {
        ...claimed.job.run,
        completedAt: new Date().toISOString(),
        progress: [...claimed.job.run.progress, "draft saved"],
        status: "saved",
      },
      ...(claimed.job.project.generationRuns ?? []).filter((run) => run.id !== claimed.job.runId),
    ],
  };
  const staleComplete = await fetchWithTimeout(
    `${baseUrl}/api/ai/worker/generation/complete`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${workerSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expectedRevision: claimed.job.expectedRevision,
        project: completedByStaleWorker,
        projectId: claimed.job.projectId,
        runId: claimed.job.runId,
        workerId: "stale-e2e-worker",
      }),
    },
  );
  if (staleComplete.status !== 409) {
    throw new Error(`Worker complete did not reject a stale worker: ${staleComplete.status}`);
  }

  const failWithoutWorker = await fetchWithTimeout(`${baseUrl}/api/ai/worker/generation/fail`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${workerSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      errorMessage: "E2E missing worker ID failure check.",
      projectId: claimed.job.projectId,
      runId: claimed.job.runId,
    }),
  });
  if (failWithoutWorker.status !== 400) {
    throw new Error(`Worker fail route did not require workerId: ${failWithoutWorker.status}`);
  }

  const staleFail = await fetchWithTimeout(`${baseUrl}/api/ai/worker/generation/fail`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${workerSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      errorMessage: "E2E stale worker failure check.",
      projectId: claimed.job.projectId,
      runId: claimed.job.runId,
      workerId: "stale-e2e-worker",
    }),
  });
  if (staleFail.status !== 409) {
    throw new Error(`Worker fail route did not reject a stale worker: ${staleFail.status}`);
  }

  const failed = await workerApiJson("/api/ai/worker/generation/fail", {
    method: "POST",
    body: JSON.stringify({
      errorMessage: "E2E intentionally failed a queued worker job after claim.",
      projectId: claimed.job.projectId,
      runId: claimed.job.runId,
      workerId: "e2e-worker",
    }),
  });
  if (failed.run?.status !== "failed") {
    throw new Error("Worker fail route did not mark the claimed run failed.");
  }
  project = (await apiJson(`/api/projects/${project.id}`)).project;

  const upload = (
    await apiJson(`/api/projects/${project.id}/uploads`, {
      method: "POST",
      body: JSON.stringify({
        contentType: "image/png",
        fileName: `android-e2e-${stamp}.png`,
      }),
    })
  ).upload;
  const pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  );
  const uploadResponse = await fetchWithTimeout(upload.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "image/png",
    },
    body: pngBytes,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Local upload PUT failed: ${uploadResponse.status}`);
  }

  project = (
    await apiJson(`/api/projects/${project.id}/photos`, {
      method: "POST",
      body: JSON.stringify({
        expectedRevision: project.revision,
        photos: [
          {
            height: 1,
            locationConfidence: "missing",
            mimeType: "image/png",
            qualityNotes: ["Automated E2E upload."],
            storagePath: upload.storagePath,
            title: "Android E2E upload",
            uploaderId: "android-tester",
            uri: upload.downloadUrl,
            width: 1,
          },
        ],
      }),
    })
  ).project;

  if (!project.photos?.length || !project.resolutionTasks?.length) {
    throw new Error("Photo import did not create expected photo/task state.");
  }

  project = (
    await apiJson(`/api/projects/${project.id}/notes`, {
      method: "POST",
      body: JSON.stringify({
        authorId: "android-tester",
        body: "This note proves web and Android can share project edits.",
        expectedRevision: project.revision,
        title: "E2E note",
      }),
    })
  ).project;

  const taskId = project.resolutionTasks.find((task) => task.status !== "resolved")?.id;
  project = (
    await apiJson(`/api/projects/${project.id}/tasks/${taskId}/resolve`, {
      method: "POST",
      body: JSON.stringify({
        expectedRevision: project.revision,
        locationLabel: "Cannon Beach",
        status: "resolved",
      }),
    })
  ).project;

  project = (
    await apiJson(`/api/projects/${project.id}/drafts`, {
      method: "POST",
      body: JSON.stringify({
        bookDraft: project.bookDraft,
        draftEditorState: project.draftEditorState,
        expectedRevision: project.revision,
        name: "Android/web E2E proof",
        selectedThemeId: project.selectedThemeId,
        subtitle: project.subtitle,
        title: project.title,
      }),
    })
  ).project;

  if (!project.publishedDrafts?.length) {
    throw new Error("Draft publish did not persist a named draft.");
  }

  await assertRoute(
    `/projects/${project.id}/editor`,
    (response) => response.ok,
    "draft editor route smoke",
  );

  project = (
    await apiJson(`/api/projects/${project.id}/finalize`, {
      method: "POST",
      body: JSON.stringify({
        expectedRevision: project.revision,
      }),
    })
  ).project;

  if (project.status !== "ready_to_print") {
    throw new Error(`Finalize did not reach ready_to_print. Status: ${project.status}`);
  }

  project = (await apiJson(`/api/projects/${project.id}`)).project;

  const proof = await apiJson(`/api/projects/${project.id}/proof`, {
    method: "POST",
    body: JSON.stringify({
      expectedRevision: project.revision,
      includeBleedGuides: true,
      includePrintSafeGuides: true,
    }),
  });

  if (!proof.html?.includes("Travel photo book") || !proof.html?.includes("Safe text area")) {
    throw new Error("Proof export did not include expected customer-facing proof HTML.");
  }
  const proofSheetCount = proof.html.match(/class="sheet/g)?.length ?? 0;
  if (proofSheetCount < project.bookDraft.pages.length + 1) {
    throw new Error(
      `Proof export rendered ${proofSheetCount} sheets for ${project.bookDraft.pages.length} spreads.`,
    );
  }

  await assertRoute(
    `/projects/${project.id}/proof`,
    (response) => response.ok,
    "print proof route smoke",
  );
}

try {
  await waitForServer();

  await assertRoute(
    "/",
    (response, text) => response.ok && text.includes("Photo Book Maker"),
    "home page smoke",
  );

  await assertRoute("/api/templates", (response, text) => {
    if (!response.ok) {
      return false;
    }

    const body = JSON.parse(text);
    return (
      body.catalog?.bookTemplatePacks?.length >= 12 &&
      body.catalog?.spreadTemplates?.length >= 64
    );
  }, "template catalog smoke");

  await assertRoute("/api/ai/local/health", (response, text) => {
    if (!response.ok) {
      return false;
    }

    const body = JSON.parse(text);
    return (
      Boolean(body.ai?.config?.plannerModel) &&
      Array.isArray(body.ai?.expectedModels) &&
      body.store?.mode
    );
  }, "local AI health route smoke");

  await assertRoute(
    "/api/projects/nonexistent/proof",
    (response, text) => response.status === 404 && text.includes("Project not found"),
    "dev auth project gate smoke",
  );

  await assertRoute(
    "/api/projects/nonexistent/generation/questions",
    (response, text) => response.status === 404 && text.includes("Project not found"),
    "generation project gate smoke",
  );

  await runProjectE2E();

  console.log("web e2e passed");
} finally {
  await stopServer();
  if (fileStoreDir) {
    await rm(fileStoreDir, { force: true, recursive: true });
  }
}
