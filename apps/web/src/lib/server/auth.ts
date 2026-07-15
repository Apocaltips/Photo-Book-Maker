import { findProjectById, type Project } from "@photo-book-maker/core";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { readProjects } from "@/lib/server/project-store";
import { DEV_AUTH_EMAIL, DEV_AUTH_ID, DEV_AUTH_NAME } from "@/lib/dev-auth";
import { getEnvValue } from "@/lib/server/env";

export type AuthenticatedUser = {
  email: string;
  id: string;
  name: string;
};

type ProjectAccessLevel = "view" | "edit" | "manage";

let cachedSupabaseAuthClient: SupabaseClient | null | undefined;

function getSupabaseAuthClient() {
  if (cachedSupabaseAuthClient !== undefined) {
    return cachedSupabaseAuthClient;
  }

  const url = getEnvValue("SUPABASE_URL");
  const serviceRoleKey = getEnvValue("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    cachedSupabaseAuthClient = null;
    return cachedSupabaseAuthClient;
  }

  cachedSupabaseAuthClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedSupabaseAuthClient;
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization");

  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length).trim() || null;
}

function isDevAuthEnabled() {
  return !getSupabaseAuthClient() && process.env.NODE_ENV !== "production";
}

function getDevAuthenticatedUser(request: Request): AuthenticatedUser {
  const email =
    request.headers.get("x-photo-book-dev-email")?.trim().toLowerCase() ||
    DEV_AUTH_EMAIL;
  const name = request.headers.get("x-photo-book-dev-name")?.trim() || DEV_AUTH_NAME;
  const id =
    request.headers.get("x-photo-book-dev-id")?.trim() ||
    email.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") ||
    DEV_AUTH_ID;

  return {
    email,
    id,
    name,
  };
}

function getDisplayName(email: string, metadata: Record<string, unknown> | null | undefined) {
  const fullName =
    typeof metadata?.full_name === "string"
      ? metadata.full_name.trim()
      : typeof metadata?.name === "string"
        ? metadata.name.trim()
        : "";

  if (fullName) {
    return fullName;
  }

  return email.split("@")[0] ?? "Photo Book Maker user";
}

export async function getAuthenticatedUser(request: Request): Promise<AuthenticatedUser | null> {
  const token = getBearerToken(request);
  const client = getSupabaseAuthClient();

  if (!client && isDevAuthEnabled()) {
    return getDevAuthenticatedUser(request);
  }

  if (!token || !client) {
    return null;
  }

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user.email) {
    return null;
  }

  return {
    id: data.user.id,
    email: data.user.email.toLowerCase(),
    name: getDisplayName(data.user.email, data.user.user_metadata),
  };
}

export function getProjectAccess(
  project: Project,
  user: Pick<AuthenticatedUser, "id">,
) {
  const member = project.members.find((entry) => entry.id === user.id);
  const isMember = Boolean(member);
  const isOwner = member?.id === project.ownerId;

  return {
    canView: isMember,
    canEdit: isMember,
    canManage: isOwner,
  };
}

export function filterProjectsForUser(
  projects: Project[],
  user: Pick<AuthenticatedUser, "id">,
) {
  return projects.filter((project) => getProjectAccess(project, user).canView);
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { message: "Sign in with your account to access your projects." },
    { status: 401 },
  );
}

export function forbiddenResponse() {
  return NextResponse.json(
    { message: "You do not have access to that project." },
    { status: 403 },
  );
}

export async function authorizeProjectRequest(
  request: Request,
  projectId: string,
  accessLevel: ProjectAccessLevel,
) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return { response: unauthorizedResponse() } as const;
  }

  const project = findProjectById(await readProjects(), projectId);
  if (!project) {
    return {
      response: NextResponse.json({ message: "Project not found." }, { status: 404 }),
    } as const;
  }

  const access = getProjectAccess(project, user);
  const isAllowed =
    accessLevel === "manage"
      ? access.canManage
      : accessLevel === "edit"
        ? access.canEdit
        : access.canView;

  if (!isAllowed) {
    return { response: forbiddenResponse() } as const;
  }

  return { project, user } as const;
}
