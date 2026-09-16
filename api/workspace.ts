import type { IncomingMessage, ServerResponse } from "node:http";
import { handleWorkspaceRequest } from "./_workspace-http.js";

type VercelRequest = IncomingMessage & {
  body?: unknown;
};

export default async function handler(
  request: VercelRequest,
  response: ServerResponse,
) {
  await handleWorkspaceRequest(request, response, request.body);
}
