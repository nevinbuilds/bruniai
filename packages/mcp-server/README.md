# bruniai-mcp-server

MCP (Model Context Protocol) server for BruniAI visual comparison functionality.

This package exposes visual comparison tools that can be used within Cursor and other MCP-compatible applications. It depends on the `bruniai` core package for comparison functionality.

Available tools:

- `compare_urls`: URL-to-URL visual comparison
- `compare_image_to_url`: Base-image-to-preview-URL visual comparison using an HTTP(S) image URL or `data:image/...` base image source

## Remote Deployment

This repository also includes a dedicated Vercel deployment app in
[`apps/mcp-vercel`](../../apps/mcp-vercel/README.md).

That app exposes:

- `GET/POST /mcp` for private Streamable HTTP MCP
- `GET /healthz` for readiness checks

Required environment variables:

- `OPENAI_API_KEY`
- `BRUNI_APP_URL` and `BRUNI_MCP_INTERNAL_SECRET` for remote per-user MCP auth
- `MCP_ALLOWED_ORIGINS` (optional)

`MCP_BEARER_TOKEN` remains available for legacy/private development deployments.
For production remote MCP, clients should send a per-user `bruni_mcp_...` token
in the `Authorization` header.

## Installation

```bash
npm install -g bruniai-mcp-server
```

## Usage

After installation, configure it in Cursor's MCP settings:

```json
{
  "mcpServers": {
    "bruniai": {
      "command": "bruniai-mcp-server",
      "env": {
        "OPENAI_API_KEY": "sk-your-api-key-here"
      }
    }
  }
}
```

## Development

Run development commands from the repository root after a single root install:

```bash
npm install
```

Recommended commands:

```bash
npm run build:mcp
npm run dev:mcp
npm run dev:mcp-vercel
```

This repo uses npm workspaces, so local `bruniai` and `bruniai-mcp-server`
packages are linked automatically from the root `node_modules`. You do not
need to publish packages to test local changes.

### Running Locally

```bash
npm run dev
```

## Documentation

See [../../docs/mcp-server.md](../../docs/mcp-server.md) for complete documentation.

## Related Packages

- [`bruniai`](../bruniai/README.md) - Core comparison library used by this MCP server
