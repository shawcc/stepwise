import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import type { CreateGoalInput } from "../src/data/stepwise-model.js";
import {
  confirmWorkspaceDecomposition,
  createWorkspaceGoal,
  getWorkspaceSnapshot,
  importWorkspaceSnapshot,
  updateWorkspaceAction,
  updateWorkspaceDecomposition,
  updateWorkspaceRelation,
} from "./_stepwise-store.js";
import {
  withPersistentWorkspace,
  WorkspacePersistenceError,
  workspacePersistenceMode,
} from "./_workspace-persistence.js";

const workspaceCommandSchema = z.discriminatedUnion("command", [
  z
    .object({
      command: z.literal("import"),
      snapshot: z.unknown(),
    })
    .strict(),
  z
    .object({
      command: z.literal("create-goal"),
      goal: z
        .object({
          title: z.string().min(1).max(160),
          intent: z.string().min(1).max(1000),
          driName: z.string().min(1).max(120),
          driRole: z.string().max(120),
          startsAt: z.string().min(1).max(80),
          dueAt: z.string().min(1).max(80),
          timezone: z.string().min(1).max(80),
          successCriteria: z.array(z.string().max(500)).min(1).max(12),
          constraints: z.array(z.string().max(500)).max(12),
          autonomy: z.string().max(1000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      command: z.literal("update-action"),
      action: z.unknown(),
    })
    .strict(),
  z
    .object({
      command: z.literal("update-relation"),
      relation: z.unknown(),
    })
    .strict(),
  z
    .object({
      command: z.literal("update-decomposition"),
      review: z.unknown(),
    })
    .strict(),
  z
    .object({
      command: z.literal("confirm-decomposition"),
      proposalId: z.string().min(1).max(80),
      decidedById: z.string().min(1).max(120),
    })
    .strict(),
]);

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  value: unknown,
): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

export async function handleWorkspaceRequest(
  request: IncomingMessage,
  response: ServerResponse,
  parsedBody?: unknown,
): Promise<void> {
  response.setHeader("X-Stepwise-Storage", workspacePersistenceMode());

  if (request.method !== "POST") {
    if (request.method === "GET") {
      try {
        const workspace = await withPersistentWorkspace(() =>
          getWorkspaceSnapshot(),
        );
        sendJson(response, 200, workspace);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Workspace 持久化读取失败";
        sendJson(response, 503, { error: message });
      }
      return;
    }

    response.setHeader("Allow", "GET, POST");
    sendJson(response, 405, { error: "仅支持 GET 和 POST" });
    return;
  }

  try {
    const command = workspaceCommandSchema.parse(
      parsedBody ?? (await readJsonBody(request)),
    );
    const workspace = await withPersistentWorkspace(() =>
      command.command === "import"
        ? importWorkspaceSnapshot(command.snapshot)
        : command.command === "create-goal"
          ? createWorkspaceGoal(command.goal as CreateGoalInput)
          : command.command === "update-action"
            ? updateWorkspaceAction(command.action)
            : command.command === "update-relation"
              ? updateWorkspaceRelation(command.relation)
              : command.command === "update-decomposition"
                ? updateWorkspaceDecomposition(command.review)
                : confirmWorkspaceDecomposition(
                    command.proposalId,
                    command.decidedById,
                  ),
    );
    sendJson(response, 200, workspace);
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues.map((issue) => issue.message).join("；")
        : error instanceof Error
          ? error.message
          : "Workspace 请求失败";
    sendJson(
      response,
      error instanceof WorkspacePersistenceError ? 503 : 400,
      { error: message },
    );
  }
}
