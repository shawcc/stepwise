import type {
  Action,
  CreateGoalInput,
  DecompositionReview,
  Relation,
} from "@/data/stepwise-model";
import type { WorkspaceSnapshot } from "@/lib/stepwise-workspace-storage";

export type ServerWorkspaceSnapshot = Omit<WorkspaceSnapshot, "version"> & {
  version: 3;
  revision: number;
};

type WorkspaceCommand =
  | { command: "import"; snapshot: WorkspaceSnapshot }
  | { command: "create-goal"; goal: CreateGoalInput }
  | { command: "update-action"; action: Action }
  | { command: "update-relation"; relation: Relation }
  | { command: "update-decomposition"; review: DecompositionReview }
  | {
      command: "confirm-decomposition";
      proposalId: string;
      decidedById: string;
    };

async function readWorkspaceResponse(
  response: Response,
): Promise<ServerWorkspaceSnapshot> {
  const result = (await response.json()) as
    | ServerWorkspaceSnapshot
    | { error?: string };
  if (!response.ok || !("revision" in result)) {
    throw new Error(
      "error" in result && result.error
        ? result.error
        : `Workspace 请求失败 (${response.status})`,
    );
  }
  return result;
}

async function sendCommand(
  command: WorkspaceCommand,
): Promise<ServerWorkspaceSnapshot> {
  return readWorkspaceResponse(
    await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
    }),
  );
}

export async function fetchWorkspace(): Promise<ServerWorkspaceSnapshot> {
  return readWorkspaceResponse(
    await fetch("/api/workspace", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    }),
  );
}

export function importWorkspace(
  snapshot: WorkspaceSnapshot,
): Promise<ServerWorkspaceSnapshot> {
  return sendCommand({ command: "import", snapshot });
}

export function createGoal(
  goal: CreateGoalInput,
): Promise<ServerWorkspaceSnapshot> {
  return sendCommand({ command: "create-goal", goal });
}

export function updateAction(
  action: Action,
): Promise<ServerWorkspaceSnapshot> {
  return sendCommand({ command: "update-action", action });
}

export function updateRelation(
  relation: Relation,
): Promise<ServerWorkspaceSnapshot> {
  return sendCommand({ command: "update-relation", relation });
}

export function updateDecomposition(
  review: DecompositionReview,
): Promise<ServerWorkspaceSnapshot> {
  return sendCommand({ command: "update-decomposition", review });
}

export function confirmDecomposition(
  proposalId: string,
  decidedById: string,
): Promise<ServerWorkspaceSnapshot> {
  return sendCommand({
    command: "confirm-decomposition",
    proposalId,
    decidedById,
  });
}
