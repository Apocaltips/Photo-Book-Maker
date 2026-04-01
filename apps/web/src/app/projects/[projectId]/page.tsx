import { ProjectProofBoardClient } from "@/components/project-proof-board-client";
import { getPublicSupabaseAuthConfig } from "@/lib/server/public-auth-config";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <ProjectProofBoardClient
      authConfig={getPublicSupabaseAuthConfig()}
      projectId={projectId}
    />
  );
}
