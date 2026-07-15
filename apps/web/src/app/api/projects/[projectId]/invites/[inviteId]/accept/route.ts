import { acceptProjectInvite, findProjectById } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import {
  getAuthenticatedUser,
  unauthorizedResponse,
} from "@/lib/server/auth";
import { findInvite, isValidInviteToken } from "@/lib/server/invites";
import { mutationErrorResponse } from "@/lib/server/mutation-response";
import {
  isRevisionConflictError,
  readProjects,
  updateProject,
} from "@/lib/server/project-store";
import { hydrateProjectForClient } from "@/lib/server/project-response";
import { getRequestOrigin } from "@/lib/server/request-origin";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ inviteId: string; projectId: string }>;
  },
) {
  const { inviteId, projectId } = await params;
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return unauthorizedResponse();
  }

  const body = (await request.json().catch(() => ({}))) as { token?: string };
  const currentProject = findProjectById(await readProjects(), projectId);
  if (!currentProject) {
    return NextResponse.json({ message: "Project not found." }, { status: 404 });
  }

  const invite = findInvite(currentProject, inviteId);
  if (!invite) {
    return NextResponse.json({ message: "Invite not found." }, { status: 404 });
  }

  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json(
      { message: "Sign in with the invited email address to join this book." },
      { status: 403 },
    );
  }

  const alreadyAccepted =
    invite.status === "accepted" &&
    invite.acceptedByUserId === user.id &&
    currentProject.members.some((member) => member.id === user.id);

  if (invite.status === "accepted" && !alreadyAccepted) {
    return NextResponse.json(
      { message: "This invite was already accepted by a different account." },
      { status: 403 },
    );
  }

  if (alreadyAccepted) {
    return NextResponse.json({
      message: "Invite already accepted. Opening the shared book now.",
      project: await hydrateProjectForClient(currentProject, getRequestOrigin(request)),
    });
  }

  if (!isValidInviteToken(invite, body.token)) {
    return NextResponse.json(
      { message: "This invite link is invalid or has expired. Ask the owner to send it again." },
      { status: 403 },
    );
  }

  let updatedProject;

  try {
    updatedProject = await updateProject(
      projectId,
      (project) => acceptProjectInvite(project, {
        inviteId,
        acceptedAt: new Date().toISOString(),
        acceptedByUserId: user.id,
        acceptedEmail: user.email,
        acceptedName: user.name,
      }),
      {
        activity: {
          actorEmail: user.email,
          actorId: user.id,
          message: `${user.name} accepted the invite.`,
          type: "invite_accepted",
        },
        expectedRevision: currentProject.revision,
      },
    );
  } catch (error) {
    if (isRevisionConflictError(error)) {
      const latestProject = findProjectById(await readProjects(), projectId);
      const latestInvite = latestProject ? findInvite(latestProject, inviteId) : null;
      const acceptedByCurrentUser =
        latestInvite?.status === "accepted" &&
        latestInvite.acceptedByUserId === user.id &&
        latestProject?.members.some((member) => member.id === user.id);

      if (acceptedByCurrentUser && latestProject) {
        return NextResponse.json({
          message: "Invite already accepted. Opening the shared book now.",
          project: await hydrateProjectForClient(latestProject, getRequestOrigin(request)),
        });
      }

      if (latestInvite?.status === "accepted") {
        return NextResponse.json(
          { message: "This invite was already accepted by a different account." },
          { status: 403 },
        );
      }
    }

    return mutationErrorResponse(error, "Unable to accept this invite.");
  }

  if (!updatedProject) {
    return NextResponse.json({ message: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({
    message: "Invite accepted. You can edit this shared book now.",
    project: await hydrateProjectForClient(updatedProject, getRequestOrigin(request)),
  });
}
