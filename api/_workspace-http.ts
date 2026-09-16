import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  confirmWorkspaceDecomposition,
  getWorkspaceSnapshot,
  importWorkspaceSnapshot,
  updateWorkspaceAction,
  updateWorkspaceDecomposition,
  updateWorkspaceRelation,
} from "./_stepwise-store.js";

const workspaceCommandSchema = z.discriminatedUnion("command", [
  z
    .object({
      command: z.literal("import"),
      snapshot: z.unknown(),
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
  if (request.method === "GET") {
    sendJson(response, 200, getWorkspaceSnapshot());
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    sendJson(response, 405, { error: "仅支持 GET 和 POST" });
    return;
  }

  try {
    const command = workspaceCommandSchema.parse(
      parsedBody ?? (await readJsonBody(request)),
    );
    const workspace =
      command.command === "import"
        ? importWorkspaceSnapshot(command.snapshot)
        : command.command === "update-action"
          ? updateWorkspaceAction(command.action)
          : command.command === "update-relation"
            ? updateWorkspaceRelation(command.relation)
            : command.command === "update-decomposition"
              ? updateWorkspaceDecomposition(command.review)
              : confirmWorkspaceDecomposition(
                  command.proposalId,
                  command.decidedById,
                );
    sendJson(response, 200, workspace);
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues.map((issue) => issue.message).join("；")
        : error instanceof Error
          ? error.message
          : "Workspace 请求失败";
    sendJson(response, 400, { error: message });
  }
}
