import { inviteCollaborator } from "@photo-book-maker/core";
import { NextResponse } from "next/server";
import { authorizeProjectRequest } from "@/lib/server/auth";
import {
  buildInviteUrl,
  createInviteToken,
  hashInviteToken,
  sendProjectInviteEmail,
} from "@/lib/server/invites";
import { mutationErrorResponse } from "@/lib/server/mutation-response";
import { updateProject } from "@/lib/server/project-store";
import { hydrateProjectForClient } from "@/lib/server/project-response";
import { getRequestOrigin } from "@/lib/server/request-origin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const auth = await authorizeProjectRequest(request, projectId, "manage");
  if ("response" in auth) {
    return auth.response;
  }
  const body = (await request.json()) as {
    email?: string;
    expectedRevision?: number;
    name?: string;
  };
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
  const origin = getRequestOrigin(request);
  let updatedProject;

  try {
    updatedProject = await updateProject(
      projectId,
      (project) =>
        inviteCollaborator(project, {
          email,
          name,
          invitedByMemberId: auth.user.id,
          token: hashInviteToken(inviteToken),
        }),
      {
        expectedRevision: body.expectedRevision,
        activity: {
          actorEmail: auth.user.email,
          actorId: auth.user.id,
          message: `${auth.user.name} invited ${name}.`,
          metadata: { inviteeEmail: email },
          type: "invite_sent",
        },
      },
    );
  } catch (error) {
    return mutationErrorResponse(error, "Unable to invite this collaborator.");
  }

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
    project: await hydrateProjectForClient(updatedProject, getRequestOrigin(request)),
  });
}
