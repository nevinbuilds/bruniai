import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createBruniMcpServer } from "./server-factory.js";
import type {
  ComparisonService,
  McpAuthContext,
  McpAuthVerifier,
} from "./types.js";

interface LoggerLike {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

export interface HttpMcpHandlerConfig {
  comparisonService: ComparisonService;
  bearerToken?: string;
  authVerifier?: McpAuthVerifier;
  allowedOrigins?: string[];
  rateLimitWindowMs?: number;
  rateLimitMaxRequests?: number;
  logger?: LoggerLike;
  transportFactory?: () => HttpTransportLike;
  serverFactory?: (
    comparisonService: ComparisonService,
    authContext?: McpAuthContext,
  ) => HttpServerLike;
}

export interface EnvConfigSource extends Record<string, string | undefined> {
  MCP_BEARER_TOKEN?: string;
  MCP_ALLOWED_ORIGINS?: string;
  BRUNI_APP_URL?: string;
  BRUNI_MCP_INTERNAL_SECRET?: string;
}

type RequestWithOptionalBody = IncomingMessage & {
  body?: unknown;
};

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface HttpTransportLike {
  onerror?: (error: Error) => void;
  close(): Promise<void>;
  handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    parsedBody?: unknown,
  ): Promise<void>;
}

export interface HttpServerLike {
  connect(transport: HttpTransportLike): Promise<void>;
}

const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 60;
const rateLimitBuckets = new Map<string, RateLimitBucket>();

export function clearHttpRateLimitBuckets(): void {
  rateLimitBuckets.clear();
}

function createDefaultLogger(): LoggerLike {
  return {
    info: (message) => console.info(message),
    warn: (message) => console.warn(message),
    error: (message) => console.error(message),
  };
}

function logEvent(
  logger: LoggerLike,
  level: "info" | "warn" | "error",
  event: string,
  details: Record<string, unknown>,
): void {
  logger[level](
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...details,
    }),
  );
}

function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function getClientIdentifier(req: IncomingMessage): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0] || "unknown";
  }

  return req.socket.remoteAddress || "unknown";
}

function checkRateLimit(
  req: IncomingMessage,
  config: HttpMcpHandlerConfig,
  authContext?: McpAuthContext,
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const windowMs = config.rateLimitWindowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS;
  const maxRequests =
    config.rateLimitMaxRequests ?? DEFAULT_RATE_LIMIT_MAX_REQUESTS;
  const key = authContext?.userId || getClientIdentifier(req);
  const now = Date.now();
  const existing = rateLimitBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { allowed: true };
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000),
      ),
    };
  }

  existing.count += 1;
  return { allowed: true };
}

function respondJson(
  res: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): void {
  res.writeHead(statusCode, {
    "content-type": "application/json",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function extractBearerToken(req: IncomingMessage): string | null {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim() || null;
}

async function validateAuthorization(
  req: IncomingMessage,
  config: HttpMcpHandlerConfig,
): Promise<{ valid: true; authContext?: McpAuthContext } | { valid: false }> {
  const bearerToken = extractBearerToken(req);

  if (config.authVerifier) {
    if (!bearerToken) {
      return { valid: false };
    }

    const authContext = await config.authVerifier(bearerToken);
    return authContext ? { valid: true, authContext } : { valid: false };
  }

  if (!config.bearerToken) {
    return { valid: true };
  }

  const expected = `Bearer ${config.bearerToken}`;
  return req.headers.authorization === expected
    ? { valid: true }
    : { valid: false };
}

function validateOrigin(
  req: IncomingMessage,
  config: HttpMcpHandlerConfig,
): boolean {
  if (!config.allowedOrigins || config.allowedOrigins.length === 0) {
    return true;
  }

  const origin = req.headers.origin;
  if (!origin) {
    return true;
  }

  return config.allowedOrigins.includes(origin);
}

async function readParsedBody(req: RequestWithOptionalBody): Promise<unknown> {
  if (req.body !== undefined) {
    return req.body;
  }

  if (req.method !== "POST") {
    return undefined;
  }

  const contentType = req.headers["content-type"] || "";
  if (!String(contentType).includes("application/json")) {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(rawBody);
}

function getRpcLogDetails(
  req: IncomingMessage,
  parsedBody: unknown,
): Record<string, unknown> {
  const body = Array.isArray(parsedBody) ? parsedBody[0] : parsedBody;
  if (!body || typeof body !== "object") {
    return {
      httpMethod: req.method || "UNKNOWN",
      path: req.url || "",
    };
  }

  const message = body as {
    method?: string;
    id?: string | number | null;
    params?: {
      name?: string;
    };
  };

  return {
    httpMethod: req.method || "UNKNOWN",
    path: req.url || "",
    rpcMethod: message.method || null,
    rpcId: message.id ?? null,
    toolName: message.params?.name || null,
  };
}

export function getHttpMcpConfigFromEnv(
  comparisonService: ComparisonService,
  env: EnvConfigSource = process.env,
): HttpMcpHandlerConfig {
  const appUrl = env.BRUNI_APP_URL?.replace(/\/$/, "");
  const internalSecret = env.BRUNI_MCP_INTERNAL_SECRET;

  return {
    comparisonService,
    bearerToken: env.MCP_BEARER_TOKEN,
    authVerifier:
      appUrl && internalSecret
        ? createBruniAppMcpAuthVerifier(appUrl, internalSecret)
        : undefined,
    allowedOrigins: parseAllowedOrigins(env.MCP_ALLOWED_ORIGINS),
  };
}

export function createBruniAppMcpAuthVerifier(
  appUrl: string,
  internalSecret: string,
): McpAuthVerifier {
  return async (token: string) => {
    const response = await fetch(`${appUrl}/api/internal/mcp/introspect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${internalSecret}`,
      },
      body: JSON.stringify({
        token,
        requiredScopes: ["reports:create"],
      }),
    });

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as {
      active?: boolean;
      userId?: string;
      tokenId?: string;
      scopes?: unknown;
      teamId?: string;
      projectId?: string;
    };
    if (!body?.active || !body.userId || !body.tokenId) {
      return null;
    }

    return {
      userId: body.userId,
      tokenId: body.tokenId,
      scopes: Array.isArray(body.scopes) ? body.scopes : [],
      ...(body.teamId ? { teamId: body.teamId } : {}),
      ...(body.projectId ? { projectId: body.projectId } : {}),
    };
  };
}

export function createHttpMcpHandler(config: HttpMcpHandlerConfig) {
  const logger = config.logger || createDefaultLogger();

  return async function handleHttpMcpRequest(
    req: RequestWithOptionalBody,
    res: ServerResponse,
    parsedBody?: unknown,
  ): Promise<void> {
    let authResult:
      | { valid: true; authContext?: McpAuthContext }
      | { valid: false };
    try {
      authResult = await validateAuthorization(req, config);
    } catch (error) {
      logEvent(logger, "error", "mcp.auth.error", {
        path: req.url || "",
        message: error instanceof Error ? error.message : String(error),
      });
      respondJson(res, 503, {
        error: "Service Unavailable",
        message: "Failed to verify MCP authorization.",
      });
      return;
    }
    if (!authResult.valid) {
      logEvent(logger, "warn", "mcp.auth.failed", {
        path: req.url || "",
        reason: "invalid_authorization",
      });
      respondJson(
        res,
        401,
        {
          error: "Unauthorized",
          message: "Missing or invalid bearer token.",
        },
        { "www-authenticate": 'Bearer realm="bruniai-mcp"' },
      );
      return;
    }

    if (!validateOrigin(req, config)) {
      logEvent(logger, "warn", "mcp.origin.rejected", {
        path: req.url || "",
        origin: req.headers.origin || null,
      });
      respondJson(res, 403, {
        error: "Forbidden",
        message: "Origin is not allowed.",
      });
      return;
    }

    const rateLimitResult = checkRateLimit(req, config, authResult.authContext);
    if (!rateLimitResult.allowed) {
      logEvent(logger, "warn", "mcp.rate_limited", {
        path: req.url || "",
        retryAfterSeconds: rateLimitResult.retryAfterSeconds,
      });
      respondJson(
        res,
        429,
        {
          error: "Too Many Requests",
          message: "Rate limit exceeded.",
        },
        { "retry-after": String(rateLimitResult.retryAfterSeconds) },
      );
      return;
    }

    let safeParsedBody = parsedBody;
    try {
      safeParsedBody =
        parsedBody !== undefined ? parsedBody : await readParsedBody(req);
    } catch (error) {
      logEvent(logger, "warn", "mcp.request.invalid_json", {
        path: req.url || "",
        message: error instanceof Error ? error.message : String(error),
      });
      respondJson(res, 400, {
        error: "Bad Request",
        message: "Invalid JSON payload.",
      });
      return;
    }

    logEvent(logger, "info", "mcp.request.received", getRpcLogDetails(req, safeParsedBody));

    const transport = config.transportFactory
      ? config.transportFactory()
      : new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
    const server = config.serverFactory
      ? config.serverFactory(config.comparisonService, authResult.authContext)
      : createBruniMcpServer(config.comparisonService, authResult.authContext);

    transport.onerror = (error) => {
      logEvent(logger, "error", "mcp.transport.error", {
        path: req.url || "",
        message: error.message,
      });
    };

    res.on("close", () => {
      void transport.close();
    });

    try {
      await server.connect(transport as never);
      await transport.handleRequest(req, res, safeParsedBody);
      logEvent(logger, "info", "mcp.request.completed", {
        path: req.url || "",
        httpMethod: req.method || "UNKNOWN",
      });
    } catch (error) {
      logEvent(logger, "error", "mcp.request.failed", {
        path: req.url || "",
        message: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        respondJson(res, 500, {
          error: "Internal Server Error",
          message: "Failed to process MCP request.",
        });
      }
    }
  };
}
