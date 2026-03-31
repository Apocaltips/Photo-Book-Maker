import { createSeedProjects, findProjectById } from "@photo-book-maker/core";
import { ProjectEditorPageClient } from "@/components/project-editor-page-client";
import { getPublicSupabaseAuthConfig } from "@/lib/server/public-auth-config";

export const dynamic = "force-dynamic";

export default async function ProjectEditorPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = findProjectById(createSeedProjects(), projectId) ?? null;

  return (
    <ProjectEditorPageClient
      authConfig={getPublicSupabaseAuthConfig()}
      projectId={projectId}
      seedProject={project}
    />
  );
}
