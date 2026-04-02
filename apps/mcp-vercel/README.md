# BruniAI MCP Vercel App

Dedicated Next.js deployment target for the remote BruniAI MCP service.

## Routes

- `/mcp`: private Streamable HTTP MCP endpoint
- `/healthz`: unauthenticated health check

Implementation note:

- The public routes rewrite to internal Next.js API routes because the current MCP
  SDK Streamable HTTP transport expects Node `IncomingMessage` and
  `ServerResponse` objects.

## Required Environment Variables

- `OPENAI_API_KEY`
- `MCP_BEARER_TOKEN`
- `MCP_ALLOWED_ORIGINS`

## Vercel Setup

1. Create a new Vercel project pointing at this repository.
2. Set the project root directory to `apps/mcp-vercel`.
3. Configure the required environment variables.
4. Add the custom domain `mcp.brunivisual.com`.
5. Point your MCP client at `https://mcp.brunivisual.com/mcp`.
