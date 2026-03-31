import { createSeedProjects } from "@photo-book-maker/core";
import type { Project } from "@photo-book-maker/core";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type ProjectRow = {
  id: string;
  owner_email: string;
  project_type: Project["type"];
  status: Project["status"];
  start_date: string;
  end_date: string;
  updated_at?: string;
  payload: Project;
};

const dataDirectory = path.join(process.cwd(), "data");
const dataFile = path.join(dataDirectory, "projects.json");
const supabaseProjectsTable =
  process.env.SUPABASE_PROJECTS_TABLE ?? "photo_book_projects";

let cachedSupabaseClient: SupabaseClient | null | undefined;

function getOwnerEmail(project: Project) {
  return (
    project.members.find((member) => member.id === project.ownerId)?.email ??
    project.invites.find((invite) => invite.role === "owner")?.email ??
    "unknown@example.com"
  );
}

function toProjectRow(project: Project): ProjectRow {
  return {
    id: project.id,
    owner_email: getOwnerEmail(project),
    project_type: project.type,
    status: project.status,
    start_date: project.startDate,
    end_date: project.endDate,
    payload: project,
  };
}

function getSupabaseAdminClient() {
  if (cachedSupabaseClient !== undefined) {
    return cachedSupabaseClient;
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    cachedSupabaseClient = null;
    return cachedSupabaseClient;
  }

  cachedSupabaseClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedSupabaseClient;
}

export function getProjectStoreMode() {
  return getSupabaseAdminClient() ? "supabase" : "file";
}

async function ensureFileStore() {
  await mkdir(dataDirectory, { recursive: true });

  try {
    await readFile(dataFile, "utf8");
  } catch {
    await writeFile(dataFile, JSON.stringify(createSeedProjects(), null, 2), "utf8");
  }
}

async function readProjectsFromFile(): Promise<Project[]> {
  await ensureFileStore();
  const raw = await readFile(dataFile, "utf8");
  return JSON.parse(raw) as Project[];
}

async function writeProjectsToFile(projects: Project[]) {
  await ensureFileStore();
  await writeFile(dataFile, JSON.stringify(projects, null, 2), "utf8");
}

async function ensureSupabaseSeed(client: SupabaseClient) {
  const { count, error } = await client
    .from(supabaseProjectsTable)
    .select("id", { count: "exact", head: true });

  if (error) {
    throw new Error(`Failed to inspect Supabase project store: ${error.message}`);
  }

  if ((count ?? 0) > 0) {
    return;
  }

  const { error: seedError } = await client
    .from(supabaseProjectsTable)
    .upsert(createSeedProjects().map(toProjectRow), { onConflict: "id" });

  if (seedError) {
    throw new Error(`Failed to seed Supabase project store: ${seedError.message}`);
  }
}

async function readProjectsFromSupabase(client: SupabaseClient): Promise<Project[]> {
  await ensureSupabaseSeed(client);

  const { data, error } = await client
    .from(supabaseProjectsTable)
    .select("payload, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to read Supabase project store: ${error.message}`);
  }

  return (data ?? []).map((row) => row.payload as Project);
}

async function writeProjectsToSupabase(client: SupabaseClient, projects: Project[]) {
  const { error } = await client
    .from(supabaseProjectsTable)
    .upsert(projects.map(toProjectRow), { onConflict: "id" });

  if (error) {
    throw new Error(`Failed to write Supabase project store: ${error.message}`);
  }
}

export async function readProjects(): Promise<Project[]> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return readProjectsFromFile();
  }

  return readProjectsFromSupabase(supabase);
}

export async function writeProjects(projects: Project[]) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return writeProjectsToFile(projects);
  }

  return writeProjectsToSupabase(supabase, projects);
}

export async function updateProject(
  projectId: string,
  updater: (project: Project) => Project | Promise<Project>,
) {
  const projects = await readProjects();
  const index = projects.findIndex((project) => project.id === projectId);

  if (index === -1) {
    return null;
  }

  const updatedProject = await updater(projects[index]);
  projects[index] = updatedProject;
  await writeProjects(projects);
  return updatedProject;
}
