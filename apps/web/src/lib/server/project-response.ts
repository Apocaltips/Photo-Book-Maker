import type { Project } from "@photo-book-maker/core";
import { signObjectReadUrl } from "@/lib/server/object-storage";

export async function hydrateProjectForClient(project: Project): Promise<Project> {
  const photos = await Promise.all(
    project.photos.map(async (photo) => {
      if (!photo.storagePath) {
        return photo;
      }

      const signedUrl = await signObjectReadUrl(photo.storagePath).catch(() => null);

      return {
        ...photo,
        imageUri: signedUrl ?? photo.imageUri,
      };
    }),
  );

  return {
    ...project,
    photos,
  };
}

export async function hydrateProjectsForClient(projects: Project[]) {
  return Promise.all(projects.map((project) => hydrateProjectForClient(project)));
}
