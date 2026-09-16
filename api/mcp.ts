import type { IncomingMessage, ServerResponse } from "node:http";
import { requirePrivateAccess } from "./_access.js";
import { handleMcpRequest } from "./_mcp-http.js";

type VercelRequest = IncomingMessage & {
  body?: unknown;
};

export default async function handler(
  request: VercelRequest,
  response: ServerResponse,
) {
  if (
    request.method !== "OPTIONS" &&
    !requirePrivateAccess(request, response)
  ) {
    return;
  }
  await handleMcpRequest(request, response, {
    writeToken: process.env.STEPWISE_MCP_WRITE_TOKEN,
    allowedOrigins: process.env.STEPWISE_MCP_ALLOWED_ORIGINS,
  });
}
