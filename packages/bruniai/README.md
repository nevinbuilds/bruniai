# bruniai

AI-powered visual regression testing tool - core comparison library.

This package provides the core comparison functionality for visual regression testing. It can be used standalone or as a dependency for building custom integrations (e.g., MCP servers, Next.js apps, etc.).

## Installation

```bash
npm install bruniai
```

## Usage

```typescript
import { compareImages, compareUrls } from "bruniai";

const result = await compareUrls({
  baseUrl: "https://example.com",
  previewUrl: "https://preview.example.com",
  page: "/contact",
});

console.log(result.status); // "pass" | "fail" | "warning"
console.log(result.visual_analysis);
console.log(result.images.base_screenshot);

const imageResult = await compareImages({
  baseImage: "https://example.com/design.png",
  previewImage: "data:image/png;base64,...",
});

console.log(imageResult.status);
```

## API

### `compareUrls(input: CompareUrlsInput): Promise<CompareUrlsOutput>`

Performs a visual comparison between two URLs.

**Parameters:**

- `baseUrl` (string): Base/reference URL to compare against
- `previewUrl` (string): Preview/changed URL to analyze
- `page` (string, optional): Page path to compare (default: "/")
- `prNumber` (string, optional): PR number for metadata
- `repository` (string, optional): Repository name for metadata

**Returns:**

- `status`: Overall comparison status ("pass" | "fail" | "warning" | "none")
- `visual_analysis`: Detailed visual analysis result from AI
- `sections_analysis`: Formatted sections analysis text
- `images`: Object containing paths to generated screenshots and diff images

### `compareImages(input: CompareImagesInput): Promise<CompareImagesOutput>`

Performs a visual comparison between two images.

**Parameters:**

- `baseImage` (string): Base/reference image as an HTTP(S) URL or `data:image/...`
- `previewImage` (string): Preview/changed image as an HTTP(S) URL or `data:image/...`

**Returns:**

- `status`: Overall comparison status ("pass" | "fail" | "warning" | "none")
- `visual_analysis`: Detailed visual analysis result from AI
- `sections_analysis`: Formatted sections analysis text
- `images`: Object containing paths to normalized images and diff images

## Requirements

- Node.js 18+
- OpenAI API key (set as `OPENAI_API_KEY` environment variable)

## Development

### Building

First, build the parent package to generate the dist files:

```bash
cd ../..
npm run build
```

Then build this package:

```bash
npm run build
```

## License

MIT
