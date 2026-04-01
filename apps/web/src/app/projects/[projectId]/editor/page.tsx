import { ProjectEditorPageClient } from "@/components/project-editor-page-client";
import { getPublicSupabaseAuthConfig } from "@/lib/server/public-auth-config";

export const dynamic = "force-dynamic";

export default async function ProjectEditorPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <ProjectEditorPageClient
      authConfig={getPublicSupabaseAuthConfig()}
      projectId={projectId}
    />
  );
}
