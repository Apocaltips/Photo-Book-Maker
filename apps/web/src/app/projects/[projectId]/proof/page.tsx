import { ProjectPrintProofPageClient } from "@/components/project-print-proof-page-client";
import { getPublicSupabaseAuthConfig } from "@/lib/server/public-auth-config";

export const dynamic = "force-dynamic";

export default async function ProjectProofPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <ProjectPrintProofPageClient
      authConfig={getPublicSupabaseAuthConfig()}
      projectId={projectId}
    />
  );
}
