import {
  getWorkspaceSnapshot,
  replaceStepwiseStore,
  resetStepwiseStoreForTests,
  type StepwiseWorkspaceSnapshot,
} from "./_stepwise-store.js";

const workspaceTable = "stepwise_workspaces";
const maxWriteAttempts = 3;

type PersistedWorkspaceRow = {
  revision: number;
  snapshot: StepwiseWorkspaceSnapshot;
};

type SupabaseConfiguration = {
  url: string;
  secretKey: string;
  workspaceId: string;
};

export class WorkspacePersistenceError extends Error {}

let operationQueue: Promise<void> = Promise.resolve();

export function workspacePersistenceMode():
  | "memory"
  | "supabase"
  | "misconfigured" {
  const hasUrl = Boolean(process.env.SUPABASE_URL);
  const hasSecret = Boolean(
    process.env.SUPABASE_SECRET_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  if (hasUrl && hasSecret) return "supabase";
  if (!hasUrl && !hasSecret) return "memory";
  return "misconfigured";
}

function configuration(): SupabaseConfiguration | undefined {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url && !secretKey) return undefined;
  if (!url || !secretKey) {
    throw new WorkspacePersistenceError(
      "Supabase 持久化配置不完整，需要同时配置 SUPABASE_URL 和 SUPABASE_SECRET_KEY。",
    );
  }

  return {
    url,
    secretKey,
    workspaceId: process.env.STEPWISE_WORKSPACE_ID ?? "default",
  };
}

function headers(
  config: SupabaseConfiguration,
  prefer?: string,
): Record<string, string> {
  return {
    apikey: config.secretKey,
    Authorization: `Bearer ${config.secretKey}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function responseMessage(response: Response): Promise<string> {
  const body = await response.text();
  return body ? `${response.status} ${body.slice(0, 500)}` : String(response.status);
}

async function loadWorkspace(
  config: SupabaseConfiguration,
): Promise<PersistedWorkspaceRow | undefined> {
  const query = new URLSearchParams({
    id: `eq.${config.workspaceId}`,
    select: "revision,snapshot",
    limit: "1",
  });
  const response = await fetch(
    `${config.url}/rest/v1/${workspaceTable}?${query}`,
    {
      headers: headers(config),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new WorkspacePersistenceError(
      `读取 Supabase Workspace 失败：${await responseMessage(response)}`,
    );
  }

  const rows = (await response.json()) as PersistedWorkspaceRow[];
  return rows[0];
}

async function insertWorkspace(
  config: SupabaseConfiguration,
  snapshot: StepwiseWorkspaceSnapshot,
): Promise<boolean> {
  const response = await fetch(`${config.url}/rest/v1/${workspaceTable}`, {
    method: "POST",
    headers: headers(config, "resolution=ignore-duplicates,return=representation"),
    body: JSON.stringify({
      id: config.workspaceId,
      revision: snapshot.revision,
      snapshot,
      updated_at: snapshot.updatedAt,
    }),
  });
  if (!response.ok) {
    throw new WorkspacePersistenceError(
      `创建 Supabase Workspace 失败：${await responseMessage(response)}`,
    );
  }
  const rows = (await response.json()) as unknown[];
  return rows.length === 1;
}

async function updateWorkspace(
  config: SupabaseConfiguration,
  expectedRevision: number,
  snapshot: StepwiseWorkspaceSnapshot,
): Promise<boolean> {
  const query = new URLSearchParams({
    id: `eq.${config.workspaceId}`,
    revision: `eq.${expectedRevision}`,
  });
  const response = await fetch(
    `${config.url}/rest/v1/${workspaceTable}?${query}`,
    {
      method: "PATCH",
      headers: headers(config, "return=representation"),
      body: JSON.stringify({
        revision: snapshot.revision,
        snapshot,
        updated_at: snapshot.updatedAt,
      }),
    },
  );
  if (!response.ok) {
    throw new WorkspacePersistenceError(
      `更新 Supabase Workspace 失败：${await responseMessage(response)}`,
    );
  }
  const rows = (await response.json()) as unknown[];
  return rows.length === 1;
}

async function runPersistentOperation<T>(
  config: SupabaseConfiguration,
  operation: () => T | Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= maxWriteAttempts; attempt += 1) {
    const persisted = await loadWorkspace(config);
    if (persisted) {
      replaceStepwiseStore(persisted.snapshot);
    } else {
      resetStepwiseStoreForTests();
    }

    const startingRevision = getWorkspaceSnapshot().revision;
    const result = await operation();
    const nextSnapshot = getWorkspaceSnapshot();
    if (nextSnapshot.revision === startingRevision) return result;

    const saved = persisted
      ? await updateWorkspace(config, persisted.revision, nextSnapshot)
      : await insertWorkspace(config, nextSnapshot);
    if (saved) return result;
  }

  throw new WorkspacePersistenceError(
    "Workspace 同时写入冲突，请重试当前操作。",
  );
}

export async function withPersistentWorkspace<T>(
  operation: () => T | Promise<T>,
): Promise<T> {
  const config = configuration();
  if (!config) return operation();

  const queued = operationQueue.then(() =>
    runPersistentOperation(config, operation),
  );
  operationQueue = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
}
