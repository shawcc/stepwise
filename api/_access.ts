import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";

const accessCookieName = "stepwise_access";
const accessCookieMaxAge = 60 * 60 * 24 * 7;

type AccessRequest = Pick<IncomingMessage, "headers"> | {
  headers?: IncomingHttpHeaders;
};

type JsonResponse = {
  status: (code: number) => JsonResponse;
  json: (value: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

export type PrivateAccessState =
  | "authorized"
  | "unauthorized"
  | "unconfigured";

function configuredAccessCode(): string | undefined {
  const value = process.env.STEPWISE_ACCESS_CODE?.trim();
  return value || undefined;
}

function headerValue(
  headers: IncomingHttpHeaders | undefined,
  name: string,
): string {
  const value = headers?.[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function cookieValue(code: string): string {
  return createHmac("sha256", code)
    .update("stepwise-private-access-v1")
    .digest("base64url");
}

function valuesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function readCookie(headers: IncomingHttpHeaders | undefined): string {
  const cookieHeader = headerValue(headers, "cookie");
  const entry = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${accessCookieName}=`));
  return entry?.slice(accessCookieName.length + 1) ?? "";
}

function readBearer(headers: IncomingHttpHeaders | undefined): string {
  const authorization = headerValue(headers, "authorization");
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

export function privateAccessState(
  request: AccessRequest,
): PrivateAccessState {
  const code = configuredAccessCode();
  if (!code) {
    return process.env.VERCEL_ENV === "production"
      ? "unconfigured"
      : "authorized";
  }

  const cookie = readCookie(request.headers);
  if (cookie && valuesMatch(cookie, cookieValue(code))) return "authorized";

  const bearer = readBearer(request.headers);
  if (bearer && valuesMatch(bearer, code)) return "authorized";

  return "unauthorized";
}

export function verifyPrivateAccessCode(candidate: string): boolean {
  const code = configuredAccessCode();
  return Boolean(code && valuesMatch(candidate, code));
}

export function privateAccessCookie(): string {
  const code = configuredAccessCode();
  if (!code) throw new Error("STEPWISE_ACCESS_CODE 未配置。");
  const secure = process.env.VERCEL_ENV ? "; Secure" : "";
  return `${accessCookieName}=${cookieValue(code)}; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=${accessCookieMaxAge}`;
}

export function expiredPrivateAccessCookie(): string {
  const secure = process.env.VERCEL_ENV ? "; Secure" : "";
  return `${accessCookieName}=; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=0`;
}

function denial(state: PrivateAccessState): {
  status: number;
  body: { error: string; code: string };
} {
  return state === "unconfigured"
    ? {
        status: 503,
        body: {
          error: "私人访问尚未配置。",
          code: "ACCESS_NOT_CONFIGURED",
        },
      }
    : {
        status: 401,
        body: {
          error: "需要私人访问授权。",
          code: "ACCESS_REQUIRED",
        },
      };
}

export function requirePrivateAccess(
  request: AccessRequest,
  response: ServerResponse,
): boolean {
  const state = privateAccessState(request);
  if (state === "authorized") return true;

  const result = denial(state);
  response.statusCode = result.status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("WWW-Authenticate", 'Bearer realm="Stepwise"');
  response.end(JSON.stringify(result.body));
  return false;
}

export function requirePrivateAccessJson(
  request: AccessRequest,
  response: JsonResponse,
): boolean {
  const state = privateAccessState(request);
  if (state === "authorized") return true;

  const result = denial(state);
  response.setHeader("WWW-Authenticate", 'Bearer realm="Stepwise"');
  response.status(result.status).json(result.body);
  return false;
}
