import { createHash, randomBytes } from "node:crypto";
import type { Project, ProjectInvite } from "@photo-book-maker/core";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type InviteDeliveryMethod = "supabase-invite" | "magic-link" | "manual";

let cachedAdminClient: SupabaseClient | null | undefined;
let cachedAnonClient: SupabaseClient | null | undefined;

function getAdminClient() {
  if (cachedAdminClient !== undefined) {
    return cachedAdminClient;
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    cachedAdminClient = null;
    return cachedAdminClient;
  }

  cachedAdminClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedAdminClient;
}

function getAnonClient() {
  if (cachedAnonClient !== undefined) {
    return cachedAnonClient;
  }

  const url = process.env.SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    cachedAnonClient = null;
    return cachedAnonClient;
  }

  cachedAnonClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedAnonClient;
}

function isExistingUserError(message: string) {
  return /already registered|already exists|already been registered/i.test(message);
}

export function createInviteToken() {
  return randomBytes(18).toString("hex");
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function buildInviteUrl(
  origin: string,
  input: { inviteId: string; projectId: string; token: string },
) {
  const url = new URL(`/invites/${input.inviteId}`, origin);
  url.searchParams.set("projectId", input.projectId);
  url.searchParams.set("token", input.token);
  return url.toString();
}

export function findInvite(project: Project, inviteId: string) {
  return project.invites.find((invite) => invite.id === inviteId) ?? null;
}

export function maskInviteEmail(email: string) {
  const [local, domain] = email.split("@");

  if (!local || !domain) {
    return email;
  }

  if (local.length <= 2) {
    return `${local[0] ?? "*"}*@${domain}`;
  }

  return `${local.slice(0, 2)}***@${domain}`;
}

export async function sendProjectInviteEmail(input: {
  email: string;
  inviteeName: string;
  projectTitle: string;
  redirectTo: string;
}) {
  const metadata = {
    full_name: input.inviteeName,
    invite_project_title: input.projectTitle,
  };
  const adminClient = getAdminClient();

  if (adminClient) {
    const { error } = await adminClient.auth.admin.inviteUserByEmail(input.email, {
      redirectTo: input.redirectTo,
      data: metadata,
    });

    if (!error) {
      return {
        delivery: "supabase-invite" as InviteDeliveryMethod,
        message: `Invite email sent to ${input.email}.`,
      };
    }

    if (!isExistingUserError(error.message)) {
      return {
        delivery: "manual" as InviteDeliveryMethod,
        message: `Invite created, but Supabase could not send the email: ${error.message}`,
      };
    }
  }

  const anonClient = getAnonClient();
  if (!anonClient) {
    return {
      delivery: "manual" as InviteDeliveryMethod,
      message:
        "Invite created, but email delivery is not configured for existing Supabase users yet.",
    };
  }

  const { error } = await anonClient.auth.signInWithOtp({
    email: input.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: input.redirectTo,
      data: metadata,
    },
  });

  if (error) {
    return {
      delivery: "manual" as InviteDeliveryMethod,
      message: `Invite created, but the magic-link email could not be sent: ${error.message}`,
    };
  }

  return {
    delivery: "magic-link" as InviteDeliveryMethod,
    message: `Invite email sent to ${input.email}.`,
  };
}

export function isValidInviteToken(invite: ProjectInvite, token: string | null | undefined) {
  if (!invite.token) {
    return false;
  }

  if (!token) {
    return false;
  }

  return invite.token === hashInviteToken(token);
}
