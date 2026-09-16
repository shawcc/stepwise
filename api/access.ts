import type { IncomingHttpHeaders } from "node:http";
import {
  expiredPrivateAccessCookie,
  privateAccessCookie,
  privateAccessState,
  verifyPrivateAccessCode,
} from "./_access.js";

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

function accessCode(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const code = (body as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

export default function handler(request: RequestLike, response: ResponseLike) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method === "GET") {
    const state = privateAccessState(request);
    response.status(state === "unconfigured" ? 503 : 200).json({
      authenticated: state === "authorized",
      configured: state !== "unconfigured",
    });
    return;
  }

  if (request.method === "POST") {
    if (!process.env.STEPWISE_ACCESS_CODE?.trim()) {
      response.status(503).json({
        error: "私人访问尚未配置。",
        code: "ACCESS_NOT_CONFIGURED",
      });
      return;
    }
    if (!verifyPrivateAccessCode(accessCode(request.body))) {
      response.status(401).json({
        error: "访问码不正确。",
        code: "INVALID_ACCESS_CODE",
      });
      return;
    }
    response.setHeader("Set-Cookie", privateAccessCookie());
    response.status(200).json({ authenticated: true, configured: true });
    return;
  }

  if (request.method === "DELETE") {
    response.setHeader("Set-Cookie", expiredPrivateAccessCookie());
    response.status(200).json({ authenticated: false, configured: true });
    return;
  }

  response.setHeader("Allow", "GET, POST, DELETE");
  response.status(405).json({ error: "仅支持 GET、POST 和 DELETE" });
}
