import type { IncomingHttpHeaders } from "node:http";
import { requirePrivateAccessJson } from "./_access.js";
import { runAgent } from "./_agent-core.js";

type RequestLike = {
  method?: string;
  body?: unknown;
  headers?: IncomingHttpHeaders;
};

type ResponseLike = {
  status: (code: number) => ResponseLike;
  json: (value: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

export default async function handler(request: RequestLike, response: ResponseLike) {
  response.setHeader("Cache-Control", "no-store");
  if (!requirePrivateAccessJson(request, response)) return;

  if (request.method !== "POST") {
    response.status(405).json({ error: "仅支持 POST" });
    return;
  }

  try {
    const result = await runAgent(request.body, {
      apiKey: process.env.WORKGRAPH_AI_API_KEY,
      baseUrl: process.env.WORKGRAPH_AI_BASE_URL,
      model: process.env.WORKGRAPH_AI_MODEL,
    });
    response.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent 请求失败";
    const status = error instanceof Error && error.name === "ConfigurationError" ? 503 : 400;
    response.status(status).json({ error: message });
  }
}
