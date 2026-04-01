import { WorkspaceHomeClient } from "@/components/workspace-home-client";
import { getPublicSupabaseAuthConfig } from "@/lib/server/public-auth-config";

export const dynamic = "force-dynamic";

export default async function Home() {
  return <WorkspaceHomeClient authConfig={getPublicSupabaseAuthConfig()} />;
}
