import {
  advanceProjectRevision,
  isDemoProject,
  normalizeProjectRecord,
  type ProjectActivityEvent,
} from "@photo-book-maker/core";
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

type ProjectActivityInput = Omit<ProjectActivityEvent, "createdAt" | "id"> & {
  createdAt?: string;
};

export class RevisionConflictError extends Error {
  currentRevision: number;
  expectedRevision: number;

  constructor(input: { currentRevision: number; expectedRevision: number }) {
    super(
      `Project revision conflict. Expected revision ${input.expectedRevision}, but current revision is ${input.currentRevision}.`,
    );
    this.name = "RevisionConflictError";
    this.currentRevision = input.currentRevision;
    this.expectedRevision = input.expectedRevision;
  }
}

export function isRevisionConflictError(error: unknown): error is RevisionConflictError {
  return error instanceof RevisionConflictError;
}

const dataDirectory = process.env.PHOTO_BOOK_FILE_STORE_DIR
  ? path.resolve(process.env.PHOTO_BOOK_FILE_STORE_DIR)
  : path.join(process.cwd(), "data");
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
    await writeFile(dataFile, JSON.stringify([], null, 2), "utf8");
  }
}

async function readProjectsFromFile(): Promise<Project[]> {
  await ensureFileStore();
  const raw = await readFile(dataFile, "utf8");
  return (JSON.parse(raw) as Project[])
    .filter((project) => !isDemoProject(project))
    .map(normalizeProjectRecord);
}

async function writeProjectsToFile(projects: Project[]) {
  await ensureFileStore();
  await writeFile(
    dataFile,
    JSON.stringify(projects.map(normalizeProjectRecord), null, 2),
    "utf8",
  );
}

async function readProjectsFromSupabase(client: SupabaseClient): Promise<Project[]> {
  const { data, error } = await client
    .from(supabaseProjectsTable)
    .select("payload, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to read Supabase project store: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => row.payload as Project)
    .filter((project) => !isDemoProject(project))
    .map(normalizeProjectRecord);
}

async function readProjectFromSupabase(client: SupabaseClient, projectId: string) {
  const { data, error } = await client
    .from(supabaseProjectsTable)
    .select("payload")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read Supabase project ${projectId}: ${error.message}`);
  }

  return data?.payload ? normalizeProjectRecord(data.payload as Project) : null;
}

async function writeProjectsToSupabase(client: SupabaseClient, projects: Project[]) {
  const { error } = await client
    .from(supabaseProjectsTable)
    .upsert(projects.map(normalizeProjectRecord).map(toProjectRow), { onConflict: "id" });

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
  const normalizedProjects = projects.map(normalizeProjectRecord);

  if (!supabase) {
    return writeProjectsToFile(normalizedProjects);
  }

  return writeProjectsToSupabase(supabase, normalizedProjects);
}

export async function updateProject(
  projectId: string,
  updater: (project: Project) => Project | Promise<Project>,
  options?: {
    activity?: ProjectActivityInput;
    expectedRevision?: number;
    skipRevisionAdvance?: boolean;
  },
) {
  const supabase = getSupabaseAdminClient();
  if (supabase) {
    const currentProject = await readProjectFromSupabase(supabase, projectId);

    if (!currentProject) {
      return null;
    }

    if (
      typeof options?.expectedRevision === "number" &&
      currentProject.revision !== options.expectedRevision
    ) {
      throw new RevisionConflictError({
        currentRevision: currentProject.revision ?? 1,
        expectedRevision: options.expectedRevision,
      });
    }

    const updatedProject = normalizeProjectRecord(await updater(currentProject));
    const nextProject = options?.skipRevisionAdvance
      ? updatedProject
      : advanceProjectRevision(updatedProject, options?.activity);
    const expectedRevision = currentProject.revision ?? 1;
    const { data, error } = await supabase
      .from(supabaseProjectsTable)
      .update(toProjectRow(nextProject))
      .eq("id", projectId)
      .eq("payload->>revision", String(expectedRevision))
      .select("payload")
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to update Supabase project ${projectId}: ${error.message}`);
    }

    if (!data?.payload) {
      const latestProject = await readProjectFromSupabase(supabase, projectId);
      throw new RevisionConflictError({
        currentRevision: latestProject?.revision ?? expectedRevision,
        expectedRevision,
      });
    }

    return normalizeProjectRecord(data.payload as Project);
  }

  const projects = await readProjects();
  const index = projects.findIndex((project) => project.id === projectId);

  if (index === -1) {
    return null;
  }

  const currentProject = normalizeProjectRecord(projects[index]);
  if (
    typeof options?.expectedRevision === "number" &&
    currentProject.revision !== options.expectedRevision
  ) {
    throw new RevisionConflictError({
      currentRevision: currentProject.revision ?? 1,
      expectedRevision: options.expectedRevision,
    });
  }

  const updatedProject = normalizeProjectRecord(await updater(currentProject));
  projects[index] = options?.skipRevisionAdvance
    ? updatedProject
    : advanceProjectRevision(updatedProject, options?.activity);
  await writeProjects(projects);
  return projects[index];
}
