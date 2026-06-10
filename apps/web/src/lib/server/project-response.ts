import {
  normalizeProjectDraftState,
  type GenerationRun,
  type Project,
} from "@photo-book-maker/core";
import { signObjectReadUrl } from "@/lib/server/object-storage";

export function sanitizeGenerationRunForClient(run: GenerationRun): GenerationRun {
  const clientRun = { ...run };
  delete clientRun.workerAttemptCount;
  delete clientRun.workerClaimedAt;
  delete clientRun.workerHeartbeatAt;
  delete clientRun.workerId;
  delete clientRun.workerLeaseExpiresAt;
  delete clientRun.workerLeaseTokenHash;

  return clientRun;
}

export async function hydrateProjectForClient(
  project: Project,
  origin?: string,
): Promise<Project> {
  const normalizedProject = normalizeProjectDraftState(project);
  const photos = await Promise.all(
    normalizedProject.photos.map(async (photo) => {
      if (!photo.storagePath) {
        return photo;
      }

      const signedUrl = await signObjectReadUrl(
        photo.storagePath,
        undefined,
        origin,
      ).catch(() => null);

      return {
        ...photo,
        imageUri: signedUrl ?? photo.imageUri,
      };
    }),
  );

  return {
    ...normalizedProject,
    generationRuns: normalizedProject.generationRuns?.map(sanitizeGenerationRunForClient),
    photos,
  };
}

export async function hydrateProjectsForClient(projects: Project[], origin?: string) {
  return Promise.all(projects.map((project) => hydrateProjectForClient(project, origin)));
}
