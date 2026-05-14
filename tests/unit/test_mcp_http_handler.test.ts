import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  clearHttpRateLimitBuckets,
  createHttpMcpHandler,
} from "../../packages/mcp-server/src/http-handler.js";
import { handleHealthCheck } from "../../packages/mcp-server/src/health-handler.js";
import type {
  ComparisonService,
  CompareImageToUrlRequest,
  CompareUrlsRequest,
} from "../../packages/mcp-server/src/types.js";

class MockResponse extends EventEmitter {
  statusCode = 200;
  headers: Record<string, string> = {};
  body = "";
  headersSent = false;

  writeHead(statusCode: number, headers: Record<string, string> = {}) {
    this.statusCode = statusCode;
    this.headers = {
      ...this.headers,
      ...headers,
    };
    this.headersSent = true;
    return this;
  }

  end(body = "") {
    this.body = body;
    this.headersSent = true;
    this.emit("finish");
    return this;
  }
}

function createRequest(options: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}) {
  const request = new EventEmitter() as EventEmitter & {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
    socket: { remoteAddress: string };
  };

  request.method = options.method;
  request.url = options.url;
  request.headers = options.headers || {};
  request.body = options.body;
  request.socket = { remoteAddress: "127.0.0.1" };

  return request;
}

describe("HTTP MCP handler", () => {
  let comparisonService: ComparisonService;

  beforeEach(() => {
    clearHttpRateLimitBuckets();
    comparisonService = {
      compareUrls: vi
        .fn<(input: CompareUrlsRequest) => Promise<unknown>>()
        .mockResolvedValue({ ok: true }),
      compareImageToUrl: vi
        .fn<(input: CompareImageToUrlRequest) => Promise<unknown>>()
        .mockResolvedValue({ ok: true }),
      sendReport: vi.fn().mockResolvedValue(null),
    };
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("passes verified MCP auth context to the server factory", async () => {
    const handleRequest = vi.fn().mockResolvedValue(undefined);
    const transport = {
      handleRequest,
      close: vi.fn().mockResolvedValue(undefined),
    };
    const connect = vi.fn().mockResolvedValue(undefined);
    const authContext = {
      userId: "user-123",
      tokenId: "token-123",
      scopes: ["reports:create"],
    };
    const serverFactory = vi.fn(() => ({ connect }));

    const handler = createHttpMcpHandler({
      comparisonService,
      authVerifier: vi.fn().mockResolvedValue(authContext),
      transportFactory: () => transport,
      serverFactory,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const req = createRequest({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: "Bearer bruni_mcp_test",
      },
      body: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      },
    });
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(serverFactory).toHaveBeenCalledWith(
      comparisonService,
      expect.objectContaining({
        ...authContext,
        mcpToken: "bruni_mcp_test",
      }),
    );
    expect(handleRequest).toHaveBeenCalledWith(req, res, req.body);
    expect(res.statusCode).toBe(200);
  });

  it("rejects requests when MCP auth verification fails", async () => {
    const handler = createHttpMcpHandler({
      comparisonService,
      authVerifier: vi.fn().mockResolvedValue(null),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const req = createRequest({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: "Bearer invalid",
      },
      body: {
        method: "initialize",
      },
    });
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(401);
    expect(res.body).toContain("Unauthorized");
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    vi.restoreAllMocks();
  });

  it("passes authenticated requests to the Streamable HTTP transport", async () => {
    const handleRequest = vi.fn().mockResolvedValue(undefined);
    const transport = {
      handleRequest,
      close: vi.fn().mockResolvedValue(undefined),
      onerror: undefined as ((error: Error) => void) | undefined,
    };
    const connect = vi.fn().mockResolvedValue(undefined);

    const handler = createHttpMcpHandler({
      comparisonService,
      bearerToken: "secret-token",
      allowedOrigins: ["https://console.brunivisual.com"],
      transportFactory: () => transport,
      serverFactory: () => ({ connect }),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const req = createRequest({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: "Bearer secret-token",
        origin: "https://console.brunivisual.com",
      },
      body: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      },
    });
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(handleRequest).toHaveBeenCalledWith(req, res, req.body);
    expect(res.statusCode).toBe(200);
  });

  it("rejects unauthenticated requests", async () => {
    const handler = createHttpMcpHandler({
      comparisonService,
      bearerToken: "secret-token",
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const req = createRequest({
      method: "POST",
      url: "/mcp",
      headers: {},
      body: {
        method: "initialize",
      },
    });
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(401);
    expect(res.body).toContain("Unauthorized");
  });

  it("rejects disallowed origins", async () => {
    const handler = createHttpMcpHandler({
      comparisonService,
      bearerToken: "secret-token",
      allowedOrigins: ["https://console.brunivisual.com"],
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const req = createRequest({
      method: "POST",
      url: "/mcp",
      headers: {
        authorization: "Bearer secret-token",
        origin: "https://evil.example.com",
      },
    });
    const res = new MockResponse();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(403);
    expect(res.body).toContain("Origin is not allowed");
  });

  it("rate limits repeated requests from the same client", async () => {
    const handleRequest = vi.fn().mockResolvedValue(undefined);
    const handler = createHttpMcpHandler({
      comparisonService,
      rateLimitMaxRequests: 1,
      rateLimitWindowMs: 60_000,
      transportFactory: () => ({
        handleRequest,
        close: vi.fn().mockResolvedValue(undefined),
      }),
      serverFactory: () => ({
        connect: vi.fn().mockResolvedValue(undefined),
      }),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const firstReq = createRequest({
      method: "GET",
      url: "/mcp",
    });
    const firstRes = new MockResponse();
    await handler(firstReq as never, firstRes as never);

    const secondReq = createRequest({
      method: "GET",
      url: "/mcp",
    });
    const secondRes = new MockResponse();
    await handler(secondReq as never, secondRes as never);

    expect(handleRequest).toHaveBeenCalledTimes(1);
    expect(secondRes.statusCode).toBe(429);
  });

  it("serves health checks without authentication", () => {
    const req = createRequest({
      method: "GET",
      url: "/healthz",
    });
    const res = new MockResponse();

    handleHealthCheck(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"status":"ok"');
  });
});
