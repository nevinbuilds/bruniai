# bruniai-mcp-server

MCP (Model Context Protocol) server for BruniAI visual comparison functionality.

This package exposes visual comparison tools that can be used within Cursor and other MCP-compatible applications. It depends on the `bruniai` core package for comparison functionality.

Available tools:

- `compare_urls`: URL-to-URL visual comparison
- `compare_images`: Image-to-image visual comparison using HTTP(S) URLs or `data:image/...` inputs

## Remote Deployment

This repository also includes a dedicated Vercel deployment app in
[`apps/mcp-vercel`](../../apps/mcp-vercel/README.md).

That app exposes:

- `GET/POST /mcp` for private Streamable HTTP MCP
- `GET /healthz` for readiness checks

Required environment variables:

- `OPENAI_API_KEY`
- `MCP_BEARER_TOKEN`
- `MCP_ALLOWED_ORIGINS`

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

### Building

First, build the parent package (bruniai) to generate the dist files:

```bash
cd ../..
npm run build
```

Then build the bruniai package:

```bash
cd packages/bruniai
npm run build
```

Finally, build this package:

```bash
cd ../mcp-server
npm run build
```

### Running Locally

```bash
npm run dev
```

## Documentation

See [../../docs/mcp-server.md](../../docs/mcp-server.md) for complete documentation.

## Related Packages

- [`bruniai`](../bruniai/README.md) - Core comparison library used by this MCP server
