import {
  actors,
  decompositionReviews,
  goals,
  initialActions,
  relations,
  type Action,
  type Actor,
  type DecompositionReview,
  type Goal,
  type Relation,
} from "@/data/stepwise-model";

export const legacyActionStorageKey = "stepwise:goal-action-workspace:v1";
export const workspaceStorageKey = "stepwise:workspace:v2";

export type WorkspaceSnapshot = {
  version: 2;
  goals: Record<string, Goal>;
  actions: Action[];
  relations: Relation[];
  decompositionReviews: DecompositionReview[];
  updatedAt: string;
};

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem" | "removeItem">;

const knownActors = Object.values(actors);

function cloneInitialWorkspace(): WorkspaceSnapshot {
  return {
    version: 2,
    goals: structuredClone(goals),
    actions: structuredClone(initialActions),
    relations: structuredClone(relations),
    decompositionReviews: structuredClone(decompositionReviews),
    updatedAt: new Date(0).toISOString(),
  };
}

function normalizeActor(
  value: unknown,
  kind: Actor["kind"],
  fallbackRole: string,
): Actor {
  if (value && typeof value === "object") {
    const actor = value as Partial<Actor>;
    if (actor.id && actor.name && actor.kind && actor.role) {
      return {
        id: String(actor.id),
        name: String(actor.name),
        kind: actor.kind,
        role: String(actor.role),
        version: actor.version ? String(actor.version) : undefined,
      };
    }
  }

  const label = typeof value === "string" ? value.trim() : "";
  const known = knownActors.find(
    (actor) =>
      actor.id === label ||
      actor.name === label ||
      `${actor.name}｜${actor.role}` === label,
  );
  if (known) return structuredClone(known);

  const [name, role] = label.split(/[｜|]/).map((item) => item.trim());
  const safeName = name || (kind === "human-dri" ? "未指定 DRI" : "自定义 Agent");
  return {
    id: `MIGRATED-${safeName.replace(/\s+/g, "-").toUpperCase()}`,
    name: safeName,
    kind,
    role: role || fallbackRole,
  };
}

export function migrateActions(value: unknown): Action[] {
  if (!Array.isArray(value)) return structuredClone(initialActions);
  return value.map((item) => {
    const action = item as Action & {
      executor?: unknown;
      approvedBy?: unknown;
    };
    return {
      ...action,
      executor: normalizeActor(action.executor, "execution-agent", "执行"),
      approvedBy: normalizeActor(action.approvedBy, "human-dri", "授权"),
      evidence: Array.isArray(action.evidence) ? action.evidence : [],
    };
  });
}

function isWorkspaceSnapshot(value: unknown): value is WorkspaceSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<WorkspaceSnapshot>;
  return Boolean(
    snapshot.version === 2 &&
      snapshot.goals &&
      Array.isArray(snapshot.actions) &&
      Array.isArray(snapshot.relations) &&
      Array.isArray(snapshot.decompositionReviews),
  );
}

export function loadWorkspaceSnapshot(
  storage?: StorageReader,
): WorkspaceSnapshot {
  const fallback = cloneInitialWorkspace();
  if (!storage) return fallback;

  try {
    const stored = JSON.parse(storage.getItem(workspaceStorageKey) ?? "null");
    if (isWorkspaceSnapshot(stored)) {
      return {
        ...stored,
        goals: structuredClone(stored.goals),
        actions: migrateActions(stored.actions),
        relations: structuredClone(stored.relations),
        decompositionReviews: structuredClone(stored.decompositionReviews),
      };
    }
  } catch {
    // Fall through to the legacy snapshot or initial workspace.
  }

  try {
    const legacyActions = JSON.parse(
      storage.getItem(legacyActionStorageKey) ?? "null",
    );
    if (Array.isArray(legacyActions)) {
      return {
        ...fallback,
        actions: migrateActions(legacyActions),
        updatedAt: new Date().toISOString(),
      };
    }
  } catch {
    // Invalid legacy data must not prevent the workspace from opening.
  }

  return fallback;
}

export function saveWorkspaceSnapshot(
  storage: StorageWriter,
  snapshot: Omit<WorkspaceSnapshot, "version" | "updatedAt">,
): WorkspaceSnapshot {
  const persisted: WorkspaceSnapshot = {
    version: 2,
    ...snapshot,
    updatedAt: new Date().toISOString(),
  };
  storage.setItem(workspaceStorageKey, JSON.stringify(persisted));
  storage.removeItem(legacyActionStorageKey);
  return persisted;
}
