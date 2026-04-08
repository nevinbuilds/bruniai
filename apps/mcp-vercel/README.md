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
3. Leave the build command as `npm run build`.
4. The app build automatically runs a workspace prebuild to generate the
   publishable `bruniai` and `bruniai-mcp-server` `dist` output before
   `next build`. This is required because the app imports those workspace
   packages by name and their published type declarations live under `dist/`.
5. The prebuild step also installs Playwright Chromium with
   `PLAYWRIGHT_BROWSERS_PATH=0`, so the deployed MCP route does not depend on
   a system Chrome binary being present on Vercel.
6. Configure the required environment variables.
7. Add the custom domain `mcp.brunivisual.com`.
8. Point your MCP client at `https://mcp.brunivisual.com/mcp`.
