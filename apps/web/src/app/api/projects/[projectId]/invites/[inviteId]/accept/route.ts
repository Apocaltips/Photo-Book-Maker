import { acceptProjectInvite, findProjectById } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import {
  getAuthenticatedUser,
  unauthorizedResponse,
} from "@/lib/server/auth";
import { findInvite, isValidInviteToken } from "@/lib/server/invites";
import { readProjects, updateProject } from "@/lib/server/project-store";
import { hydrateProjectForClient } from "@/lib/server/project-response";

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
    currentProject.members.some(
      (member) => member.email.toLowerCase() === user.email.toLowerCase(),
    );

  if (!alreadyAccepted && !isValidInviteToken(invite, body.token)) {
    return NextResponse.json(
      { message: "This invite link is invalid or has expired. Ask the owner to send it again." },
      { status: 403 },
    );
  }

  const updatedProject = await updateProject(projectId, (project) => {
    if (alreadyAccepted) {
      return project;
    }

    return acceptProjectInvite(project, {
      inviteId,
      acceptedAt: new Date().toISOString(),
      acceptedByUserId: user.id,
      acceptedEmail: user.email,
      acceptedName: user.name,
    });
  });

  if (!updatedProject) {
    return NextResponse.json({ message: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({
    message: alreadyAccepted
      ? "Invite already accepted. Opening the shared book now."
      : "Invite accepted. You can edit this shared book now.",
    project: await hydrateProjectForClient(updatedProject),
  });
}
