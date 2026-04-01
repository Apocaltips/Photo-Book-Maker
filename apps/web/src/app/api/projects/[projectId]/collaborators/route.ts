import { inviteCollaborator } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { authorizeProjectRequest } from "@/lib/server/auth";
import {
  buildInviteUrl,
  createInviteToken,
  hashInviteToken,
  sendProjectInviteEmail,
} from "@/lib/server/invites";
import { updateProject } from "@/lib/server/project-store";
import { hydrateProjectForClient } from "@/lib/server/project-response";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const auth = await authorizeProjectRequest(request, projectId, "manage");
  if ("response" in auth) {
    return auth.response;
  }
  const body = (await request.json()) as { email?: string; name?: string };
  const email = body.email?.trim().toLowerCase();
  const name = body.name?.trim();

  if (!email || !name) {
    return NextResponse.json(
      { message: "Add both a collaborator name and email before sending the invite." },
      { status: 400 },
    );
  }

  if (auth.project.members.some((member) => member.email.toLowerCase() === email)) {
    return NextResponse.json(
      { message: `${email} is already part of this book.` },
      { status: 409 },
    );
  }

  const inviteToken = createInviteToken();
  const origin = new URL(request.url).origin;
  const updatedProject = await updateProject(projectId, (project) =>
    inviteCollaborator(project, {
      email,
      name,
      invitedByMemberId: auth.user.id,
      token: hashInviteToken(inviteToken),
    }),
  );

  if (!updatedProject) {
    return NextResponse.json({ message: "Project not found." }, { status: 404 });
  }

  const invite = updatedProject.invites.find((entry) => entry.email.toLowerCase() === email);
  if (!invite) {
    return NextResponse.json(
      { message: "The invite was created, but the collaborator link could not be prepared." },
      { status: 500 },
    );
  }

  const inviteUrl = buildInviteUrl(origin, {
    inviteId: invite.id,
    projectId,
    token: inviteToken,
  });
  const delivery = await sendProjectInviteEmail({
    email,
    inviteeName: name,
    projectTitle: updatedProject.title,
    redirectTo: inviteUrl,
  });

  return NextResponse.json({
    inviteUrl,
    message: delivery.message,
    project: await hydrateProjectForClient(updatedProject),
  });
}
