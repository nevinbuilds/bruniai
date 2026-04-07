# BruniAI MCP Server

The BruniAI MCP (Model Context Protocol) server exposes visual comparison functionality as a tool that can be used within Cursor and other MCP-compatible applications.

## Overview

The MCP server provides two tools:

- `compare_urls` for comprehensive visual analysis between two URLs
- `compare_image_to_url` for comprehensive visual analysis between one base image source and one preview URL

Shared capabilities:

- Normalizes inputs into comparable images
- Generates diff images highlighting differences
- Analyzes sections and layout changes
- Returns structured results with image file paths

Tool-specific behavior:

- `compare_urls` captures full-page screenshots from the two URLs before analysis
- `compare_image_to_url` normalizes the provided base image source, captures the preview URL as a webpage screenshot, and compares those two rendered artifacts

## Installation

### Global Installation (Recommended)

Install the package globally to make the MCP server available system-wide:

```bash
npm install -g bruniai
```

After installation, verify the server is available:

```bash
bruniai-mcp-server --version
```

### Local Installation

For local development or project-specific installation:

```bash
npm install bruniai
```

Then run the server using:

```bash
npx bruniai-mcp-server
```

## Configuration

### Environment Variables

The MCP server requires the following environment variable:

- `OPENAI_API_KEY` (required): Your OpenAI API key for GPT-4 Vision analysis

For remote HTTP deployment, also configure:

- `MCP_BEARER_TOKEN` (required): bearer token for private MCP access
- `MCP_ALLOWED_ORIGINS` (optional): comma-separated list of allowed `Origin` values

Set it before running the server:

```bash
export OPENAI_API_KEY="sk-your-api-key-here"
bruniai-mcp-server
```

### Cursor Configuration

To use the BruniAI MCP server in Cursor, add it to your Cursor MCP configuration file.

#### Configuration Format

Add the following to your MCP configuration:

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

**Note**: If you installed globally, use `bruniai-mcp-server`. If installed locally, use the full path or `npx bruniai-mcp-server`.

## Usage

Once configured, the `compare_urls` and `compare_image_to_url` tools will be available in Cursor. You can invoke them through natural language or direct tool calls.

## Remote HTTP Deployment

This repository now includes a dedicated Vercel app at
[`apps/mcp-vercel`](../apps/mcp-vercel/README.md) for hosting the MCP server
at a URL such as `https://mcp.brunivisual.com/mcp`.

Under the hood, that Next.js app uses Node API routes instead of App Router
route handlers because the current MCP SDK Streamable HTTP transport expects
Node `IncomingMessage` and `ServerResponse` objects.

Recommended Vercel setup:

1. Create a separate Vercel project for this repository.
2. Set the project root directory to `apps/mcp-vercel`.
3. Configure `OPENAI_API_KEY`, `MCP_BEARER_TOKEN`, and `MCP_ALLOWED_ORIGINS`.
4. Add the custom domain `mcp.brunivisual.com`.
5. Point MCP clients at `https://mcp.brunivisual.com/mcp`.

### Tool Schema

**Name**: `compare_urls`

**Description**: Compare two URLs visually and analyze differences. Takes screenshots, generates diff images, analyzes sections, and performs AI-powered visual analysis. Returns analysis results with paths to generated images.

**Input Parameters**:

- `baseUrl` (string, required): Base/reference URL to compare against
- `previewUrl` (string, required): Preview/changed URL to analyze
- `page` (string, optional): Page path to compare (default: "/")

**Output**:

The tool returns a JSON object with the following structure:

```typescript
{
  status: "pass" | "fail" | "warning",
  visual_analysis: {
    // Complete visual analysis result
    status: "pass" | "fail" | "warning",
    critical_issues: {
      sections: Array<{
        name: string,
        status: "Present" | "Missing",
        description: string,
        section_id: string
      }>,
      summary: string
    },
    structural_analysis: {
      section_order: string,
      layout: string,
      broken_layouts: string
    },
    visual_changes: {
      diff_highlights: string[],
      animation_issues: string,
      conclusion: string
    },
    conclusion: {
      critical_issues: string,
      visual_changes: string,
      recommendation: "pass" | "review_required" | "reject",
      summary: string
    }
    // ... additional fields
  },
  sections_analysis: string,  // Formatted text analysis
  images: {
    base_screenshot: string,      // File path
    preview_screenshot: string,     // File path
    diff_image: string,             // File path
    section_screenshots?: {         // Optional
      [sectionId: string]: {
        base: string,               // File path
        preview: string             // File path
      }
    }
  }
}
```

**Name**: `compare_image_to_url`

**Description**: Compare a base image source against a preview URL visually and analyze differences. Captures the preview page, normalizes the base image source, generates diff images, analyzes sections, and returns analysis results with paths to generated images.

**Input Parameters**:

- `baseImageSource` (string, required): Base/reference image source as an HTTP(S) image URL or `data:image/...`
- `previewUrl` (string, required): Preview/changed webpage URL to analyze
- `page` (string, optional): Page path to compare on the preview URL (default: "/")

### Example Usage in Cursor

You can ask Cursor to compare URLs:

Or be more specific:

```
For my website  https://www.example.com I have changes in this preview site https://company-example.vercel.app use the bruniai-mcp-server to compare the page : /contact
```

For images:

```text
Use bruniai-mcp-server compare_image_to_url to compare this design image https://example.com/design.png against the preview site https://preview.example.com on /contact.
```

## How It Works

1. **Screenshot Capture**: Takes full-page screenshots of both URLs using headless browser automation
2. **Diff Generation**: Creates a visual diff image highlighting pixel differences
3. **Section Analysis**: Analyzes the page structure to identify major sections
4. **Visual Analysis**: Uses GPT-4 Vision to analyze screenshots and detect:
   - Missing sections
   - Structural changes
   - Visual differences
   - Layout issues
5. **Section Screenshots**: Optionally captures individual section screenshots for detailed comparison

## Image Storage

Images are stored in a temporary directory created for each comparison:

- **Location**: System temp directory (e.g., `/tmp/bruniai-{timestamp}/` on Unix systems)
- **Naming**: Files are named with page suffix and section IDs
- **Format**: PNG format for all screenshots and diff images
- **Cleanup**: Temporary directories are not automatically cleaned up (managed by OS temp cleanup)

## Troubleshooting

### Server Not Starting

- Verify Node.js version (requires Node.js 20+)
- Check that `OPENAI_API_KEY` is set correctly
- Ensure the package is installed: `npm list -g bruniai`

### Tool Execution Errors

- Verify both URLs are accessible
- Check that URLs are valid and reachable
- Ensure OpenAI API key has sufficient credits/quota
- Review error messages in the tool response

### Image Path Issues

- Images are stored in temporary directories
- Paths are absolute file system paths
- Ensure the temp directory is accessible
- Files persist until OS temp cleanup runs

### Cursor Integration Issues

- Restart Cursor after configuration changes
- Verify the MCP server command path is correct
- Check Cursor logs for connection errors
- Ensure stdio transport is working correctly

## Development

### Building from Source

```bash
git clone <repository-url>
cd bruniai

# Install dependencies
npm install

# Build the main package first (required for MCP subpackage)
npm run build

# Build the MCP subpackage
cd packages/mcp-server
npm install
npm run build
```

### Running Locally

```bash
# From the MCP subpackage directory
cd packages/mcp-server
npm run build
node dist/mcp-server.js
```

### Testing

Test the MCP server manually:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/mcp-server.js
```

## Limitations

- Requires OpenAI API access with GPT-4 Vision capability
- Browser automation requires Playwright browsers to be installed
- Comparison operations can take 30-60 seconds depending on page complexity
- Images are stored temporarily and may be cleaned up by the OS
- Single page comparison per tool call (use multiple calls for multiple pages)

## Support

For issues, questions, or contributions, please refer to the main project repository.
