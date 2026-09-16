import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createStepwiseMcpServer } from "./_mcp-server.js";

type McpRequest = IncomingMessage & {
  body?: unknown;
};

type McpResponse = ServerResponse & {
  status?: (code: number) => McpResponse;
  json?: (value: unknown) => void;
};

type McpHttpEnvironment = {
  writeToken?: string;
  allowedOrigins?: string;
};

function sendJson(
  response: McpResponse,
  status: number,
  value: Record<string, unknown>,
) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

function isAllowedOrigin(
  request: McpRequest,
  allowedOrigins?: string,
): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;

  const host = request.headers["x-forwarded-host"] ?? request.headers.host;
  const protocol = request.headers["x-forwarded-proto"] ?? "https";
  const sameOrigin = host ? `${protocol}://${host}` : undefined;
  const configured = (allowedOrigins ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return origin === sameOrigin || configured.includes(origin);
}

export async function handleMcpRequest(
  request: McpRequest,
  response: McpResponse,
  environment: McpHttpEnvironment,
  parsedBody?: unknown,
): Promise<void> {
  response.setHeader("Cache-Control", "no-store");

  if (!isAllowedOrigin(request, environment.allowedOrigins)) {
    sendJson(response, 403, {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message:
          "Origin is not allowed. Configure STEPWISE_MCP_ALLOWED_ORIGINS for trusted clients.",
      },
      id: null,
    });
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed. Use POST for this stateless MCP endpoint.",
      },
      id: null,
    });
    return;
  }

  const server = createStepwiseMcpServer({
    writeToken: environment.writeToken,
  });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(
      request,
      response,
      parsedBody ?? request.body,
    );
  } catch {
    if (!response.headersSent) {
      sendJson(response, 500, {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Stepwise MCP request failed.",
        },
        id: null,
      });
    }
  } finally {
    await transport.close();
    await server.close();
  }
}
