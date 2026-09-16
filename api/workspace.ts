import type { IncomingMessage, ServerResponse } from "node:http";
import { requirePrivateAccess } from "./_access.js";
import { handleWorkspaceRequest } from "./_workspace-http.js";

type VercelRequest = IncomingMessage & {
  body?: unknown;
};

export default async function handler(
  request: VercelRequest,
  response: ServerResponse,
) {
  if (!requirePrivateAccess(request, response)) return;
  await handleWorkspaceRequest(request, response, request.body);
}
