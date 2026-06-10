import type {
  Project,
  ProjectActivityEvent,
  ProjectActivityEventType,
} from "./types";

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId ? `${prefix}-${randomId}` : `${prefix}-${Date.now()}`;
}

export function createProjectActivityEvent(input: {
  actorEmail?: string;
  actorId?: string;
  createdAt?: string;
  message: string;
  metadata?: ProjectActivityEvent["metadata"];
  type: ProjectActivityEventType;
}): ProjectActivityEvent {
  return {
    id: createId("activity"),
    actorEmail: input.actorEmail,
    actorId: input.actorId,
    createdAt: input.createdAt ?? nowIso(),
    message: input.message,
    metadata: input.metadata,
    type: input.type,
  };
}

export function normalizeProjectRecord(project: Project): Project {
  return {
    ...project,
    revision: Number.isFinite(project.revision) ? project.revision : 1,
    updatedAt: project.updatedAt ?? new Date().toISOString(),
    activity: project.activity ?? [],
  };
}

export function advanceProjectRevision(
  project: Project,
  activityInput?: Parameters<typeof createProjectActivityEvent>[0],
): Project {
  const normalizedProject = normalizeProjectRecord(project);
  const updatedAt = nowIso();
  const activity = activityInput
    ? [
        createProjectActivityEvent({
          ...activityInput,
          createdAt: activityInput.createdAt ?? updatedAt,
        }),
        ...(normalizedProject.activity ?? []),
      ].slice(0, 100)
    : normalizedProject.activity;

  return {
    ...normalizedProject,
    revision: (normalizedProject.revision ?? 1) + 1,
    updatedAt,
    activity,
  };
}
