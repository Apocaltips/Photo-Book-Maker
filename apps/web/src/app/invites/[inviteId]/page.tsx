import { findProjectById } from "@photo-book-maker/core";
import { InviteAcceptanceClient } from "@/components/invite-acceptance-client";
import { getPublicSupabaseAuthConfig } from "@/lib/server/public-auth-config";
import { findInvite, isValidInviteToken } from "@/lib/server/invites";
import { readProjects } from "@/lib/server/project-store";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ inviteId: string }>;
  searchParams: Promise<{ projectId?: string; token?: string }>;
}) {
  const { inviteId } = await params;
  const { projectId, token } = await searchParams;
  const resolvedProjectId = projectId ?? null;
  const project = resolvedProjectId
    ? findProjectById(await readProjects(), resolvedProjectId)
    : null;
  const invite = project ? findInvite(project, inviteId) : null;

  if (!project || !invite || !token) {
    return (
      <main className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-8 px-5 py-6 md:px-8 lg:px-10">
        <section className="surface rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow">Collaborator invite</div>
          <h1 className="display mt-3 text-4xl text-[#1f1814] sm:text-5xl">
            This invite link is no longer valid.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#5b4f47]">
            Ask the book owner to send you a fresh collaborator invite.
          </p>
        </section>
      </main>
    );
  }

  const inviteIsValid =
    invite.status === "accepted" || isValidInviteToken(invite, token);

  if (!inviteIsValid) {
    return (
      <main className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-8 px-5 py-6 md:px-8 lg:px-10">
        <section className="surface rounded-[2rem] p-6 md:p-8">
          <div className="eyebrow">Collaborator invite</div>
          <h1 className="display mt-3 text-4xl text-[#1f1814] sm:text-5xl">
            This invite link is no longer valid.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#5b4f47]">
            Ask the book owner to send you a fresh collaborator invite.
          </p>
        </section>
      </main>
    );
  }

  return (
    <InviteAcceptanceClient
      authConfig={getPublicSupabaseAuthConfig()}
      invite={{
        email: invite.email,
        inviteId,
        projectId: project.id,
        projectTitle: project.title,
        status: invite.status,
        token,
      }}
    />
  );
}
