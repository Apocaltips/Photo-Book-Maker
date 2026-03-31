import { createSeedProjects, findProjectById } from "@photo-book-maker/core";
import { ProjectPreviewPageClient } from "@/components/project-preview-page-client";
import { getPublicSupabaseAuthConfig } from "@/lib/server/public-auth-config";

export const dynamic = "force-dynamic";

export default async function ProjectPreviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = findProjectById(createSeedProjects(), projectId) ?? null;

  return (
    <ProjectPreviewPageClient
      authConfig={getPublicSupabaseAuthConfig()}
      projectId={projectId}
      seedProject={project}
    />
  );
}
