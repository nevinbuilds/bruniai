#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "url";
import { bruniaiComparisonService } from "./bruniai-service.js";
import { createBruniMcpServer } from "./server-factory.js";

export function createServer() {
  return createBruniMcpServer(bruniaiComparisonService);
}

async function main() {
  const server = createServer();

  // Connect to stdio transport.
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("BruniAI MCP server running on stdio");
}

const entrypointHref = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;

if (entrypointHref && import.meta.url === entrypointHref) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
