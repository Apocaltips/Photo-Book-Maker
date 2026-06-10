/* global AbortSignal, Buffer, console, fetch, process, setTimeout */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
const readinessSecret =
  process.env.E2E_ALPHA_READINESS_SECRET ?? "photo-book-e2e-readiness-secret";
const otherDevAuthHeaders = {
  "X-Photo-Book-Dev-Email": "family-friend@example.com",
  "X-Photo-Book-Dev-Id": "family-friend",
  "X-Photo-Book-Dev-Name": "Family Friend",
};

async function detectExistingBaseUrl() {
  if (process.env.E2E_WEB_BASE_URL) {
    return undefined;
  }

  const probeUrls = [
    "http://127.0.0.1:3000",
    defaultBaseUrl,
    "http://127.0.0.1:3221",
    "http://127.0.0.1:3222",
  ];

  for (const probeUrl of [...new Set(probeUrls)]) {
    try {
      const response = await fetch(probeUrl, {
        signal: AbortSignal.timeout(1_500),
      });
      const text = await response.text();

      if (response.ok && text.includes("Photo Book Maker")) {
        return probeUrl;
      }
    } catch {
      // Keep probing known local dev ports.
    }
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
          LOCAL_AI_WORKER_MAX_ATTEMPTS: "2",
          LOCAL_AI_WORKER_MIN_LEASE_SECONDS: "1",
          LOCAL_AI_WORKER_SECRET: workerSecret,
          ALPHA_READINESS_SECRET: readinessSecret,
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
          LOCAL_AI_WORKER_MAX_ATTEMPTS: "2",
          LOCAL_AI_WORKER_MIN_LEASE_SECONDS: "1",
          LOCAL_AI_WORKER_SECRET: workerSecret,
          ALPHA_READINESS_SECRET: readinessSecret,
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

async function expireStoredPhotoImageUri(projectId, photoId) {
  if (!fileStoreDir) {
    return null;
  }

  const projectStorePath = path.join(fileStoreDir, "projects.json");
  const projects = JSON.parse(await readFile(projectStorePath, "utf8"));
  const project = projects.find((entry) => entry.id === projectId);
  const photo = project?.photos?.find((entry) => entry.id === photoId);

  if (!photo) {
    throw new Error(`Could not find uploaded photo ${photoId} in isolated project store.`);
  }

  const staleUri = `expired://signed-url/${photoId}`;
  photo.imageUri = staleUri;
  await writeFile(projectStorePath, `${JSON.stringify(projects, null, 2)}\n`, "utf8");

  return staleUri;
}

async function assertAlphaReadinessRoute() {
  if (reuseExistingServer && !process.env.E2E_ALPHA_READINESS_SECRET) {
    return;
  }

  const unauthorized = await fetchWithTimeout(`${baseUrl}/api/alpha/readiness?mode=local`);
  if (unauthorized.status !== 401) {
    throw new Error(`Alpha readiness route did not reject missing secret: ${unauthorized.status}`);
  }

  const response = await fetchWithTimeout(`${baseUrl}/api/alpha/readiness?mode=local`, {
    headers: {
      "Authorization": `Bearer ${readinessSecret}`,
    },
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `Alpha readiness route failed authorized request: ${response.status}\n${JSON.stringify(
        body,
      )}`,
    );
  }

  const checks = Array.isArray(body.checks) ? body.checks : [];
  const hasTemplateCheck = checks.some(
    (check) => check.name === "template catalog" && check.status === "pass",
  );
  const hasStoreModeCheck = checks.some((check) => check.name === "project store mode");
  const hasWorkerCheck = checks.some(
    (check) => check.name === "private AI worker queue" && check.status === "pass",
  );
  const hasAiQueueCheck = checks.some((check) => check.name === "AI generation queue");

  if (!hasTemplateCheck || !hasStoreModeCheck || !hasWorkerCheck || !hasAiQueueCheck) {
    throw new Error(
      `Alpha readiness route did not return expected checks.\n${JSON.stringify(body, null, 2)}`,
    );
  }

  const providerResponse = await fetchWithTimeout(
    `${baseUrl}/api/alpha/readiness?mode=provider`,
    {
      headers: {
        "Authorization": `Bearer ${readinessSecret}`,
      },
    },
  );
  const providerBody = await providerResponse.json().catch(() => ({}));

  if (!providerResponse.ok) {
    throw new Error(
      `Provider readiness route failed authorized request: ${providerResponse.status}\n${JSON.stringify(
        providerBody,
      )}`,
    );
  }

  const providerChecks = Array.isArray(providerBody.checks) ? providerBody.checks : [];
  const hasProviderAlphaChecks = [
    "Stripe checkout env",
    "transactional email provider",
    "Sentry observability",
    "PostHog analytics",
    "print provider choice",
    "print sample order",
  ].every((name) => providerChecks.some((check) => check.name === name));

  if (!hasProviderAlphaChecks || providerBody.status !== "failed") {
    throw new Error(
      `Provider readiness route did not expose the expected provider-alpha blockers.\n${JSON.stringify(
        providerBody,
        null,
        2,
      )}`,
    );
  }
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

  const queuedRetryGeneration = await apiJson(`/api/projects/${project.id}/generation/run`, {
    method: "POST",
    body: JSON.stringify({
      expectedRevision: project.revision,
      questionnaire: generationQuestions.questionnaire.answers,
    }),
  });
  project = queuedRetryGeneration.project;
  if (
    queuedRetryGeneration.run?.status !== "queued" ||
    !queuedRetryGeneration.run?.progress?.some((entry) =>
      entry.includes("private local AI worker"),
    )
  ) {
    throw new Error("Worker-enabled generation route did not queue a worker job.");
  }

  const queuedRetryStatus = await apiJson(
    `/api/projects/${project.id}/generation/runs/${queuedRetryGeneration.run.id}`,
  );
  if (
    queuedRetryStatus.revision !== project.revision ||
    queuedRetryStatus.run?.id !== queuedRetryGeneration.run.id ||
    queuedRetryStatus.run?.status !== "queued"
  ) {
    throw new Error("Generation run status route did not return the queued worker run.");
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

  const retryClaimOne = await workerApiJson("/api/ai/worker/generation/claim", {
    method: "POST",
    body: JSON.stringify({
      leaseSeconds: 1,
      workerId: "e2e-retry-worker-one",
    }),
  });
  if (
    retryClaimOne.job?.runId !== queuedRetryGeneration.run.id ||
    retryClaimOne.job?.run?.workerAttemptCount !== 1
  ) {
    throw new Error("Worker claim route did not record the first retry attempt.");
  }

  const activeRetryClaim = await workerApiJson("/api/ai/worker/generation/claim", {
    method: "POST",
    body: JSON.stringify({
      leaseSeconds: 1,
      workerId: "e2e-retry-worker-two",
    }),
  });
  if (activeRetryClaim.job) {
    throw new Error("Worker claim route allowed a second worker before the lease expired.");
  }

  await new Promise((resolve) => setTimeout(resolve, 1200));

  const retryClaimTwo = await workerApiJson("/api/ai/worker/generation/claim", {
    method: "POST",
    body: JSON.stringify({
      leaseSeconds: 1,
      workerId: "e2e-retry-worker-two",
    }),
  });
  if (
    retryClaimTwo.job?.runId !== queuedRetryGeneration.run.id ||
    retryClaimTwo.job?.run?.workerAttemptCount !== 2
  ) {
    throw new Error("Worker claim route did not reclaim the expired job for attempt two.");
  }

  await new Promise((resolve) => setTimeout(resolve, 1200));

  const exhaustedRetryClaim = await workerApiJson("/api/ai/worker/generation/claim", {
    method: "POST",
    body: JSON.stringify({
      leaseSeconds: 1,
      workerId: "e2e-retry-worker-three",
    }),
  });
  if (
    exhaustedRetryClaim.job ||
    exhaustedRetryClaim.failedRun?.id !== queuedRetryGeneration.run.id ||
    exhaustedRetryClaim.failedRun?.status !== "failed" ||
    !/exceeded 2 local AI worker attempt/i.test(exhaustedRetryClaim.message ?? "")
  ) {
    throw new Error("Worker claim route did not fail an exhausted retry job.");
  }

  const exhaustedRunStatus = await apiJson(
    `/api/projects/${project.id}/generation/runs/${queuedRetryGeneration.run.id}`,
  );
  if (exhaustedRunStatus.run?.status !== "failed") {
    throw new Error("Generation run status route did not expose exhausted run failure.");
  }

  project = (await apiJson(`/api/projects/${project.id}`)).project;

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
    throw new Error("Worker-enabled generation route did not queue a second worker job.");
  }

  const claimed = await workerApiJson("/api/ai/worker/generation/claim", {
    method: "POST",
    body: JSON.stringify({
      workerId: "e2e-worker",
    }),
  });
  if (
    claimed.job?.runId !== queuedGeneration.run.id ||
    claimed.job?.workerId !== "e2e-worker" ||
    claimed.job?.run?.workerAttemptCount !== 1
  ) {
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

  const photoImport = await apiJson(`/api/projects/${project.id}/photos`, {
    method: "POST",
    body: JSON.stringify({
      expectedRevision: project.revision,
      photos: [
        {
          contentHash: "e2e-png-content-hash",
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
  });
  project = photoImport.project;

  if (
    photoImport.photoImport?.addedCount !== 1 ||
    !project.photos?.length ||
    !project.resolutionTasks?.length
  ) {
    throw new Error("Photo import did not create expected photo/task state.");
  }

  const revisionBeforeDuplicateImport = project.revision;
  const duplicateImport = await apiJson(`/api/projects/${project.id}/photos`, {
    method: "POST",
    body: JSON.stringify({
      expectedRevision: project.revision,
      photos: [
        {
          contentHash: "e2e-png-content-hash",
          height: 1,
          locationConfidence: "missing",
          mimeType: "image/png",
          qualityNotes: ["Automated duplicate E2E upload."],
          storagePath: upload.storagePath,
          title: "Android E2E upload duplicate",
          uploaderId: "android-tester",
          uri: upload.downloadUrl,
          width: 1,
        },
      ],
    }),
  });
  project = duplicateImport.project;
  if (
    duplicateImport.photoImport?.addedCount !== 0 ||
    duplicateImport.photoImport?.skippedDuplicateCount !== 1 ||
    project.photos.length !== 1 ||
    project.revision !== revisionBeforeDuplicateImport
  ) {
    throw new Error("Duplicate photo import was not skipped without a revision change.");
  }
  const uploadedPhotoId = project.photos[0]?.id;
  const staleProofImageUri = uploadedPhotoId
    ? await expireStoredPhotoImageUri(project.id, uploadedPhotoId)
    : null;

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
  if (staleProofImageUri && proof.html.includes(staleProofImageUri)) {
    throw new Error("Proof export reused an expired stored photo URL instead of a fresh read URL.");
  }
  const proofStoragePath = upload.storagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  if (!proof.html.includes(proofStoragePath)) {
    throw new Error("Proof export did not render the uploaded photo from object storage.");
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
      body.store?.mode &&
      body.worker?.maxAttempts === 2 &&
      body.worker?.minLeaseSeconds === 1 &&
      typeof body.queue?.staleRuns === "number"
    );
  }, "local AI health route smoke");

  await assertAlphaReadinessRoute();

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
