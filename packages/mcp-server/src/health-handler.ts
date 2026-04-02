import type { IncomingMessage, ServerResponse } from "node:http";

export function handleHealthCheck(
  req: IncomingMessage,
  res: ServerResponse,
): void {
  if (req.method !== "GET") {
    res.writeHead(405, { allow: "GET", "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Method Not Allowed",
        message: "Only GET is supported.",
      }),
    );
    return;
  }

  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      status: "ok",
      service: "bruniai-mcp",
      transport: "streamable-http",
    }),
  );
}
