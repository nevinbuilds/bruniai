import { compareImages } from "../../../packages/bruniai/src/compare-images.js";
import { compareUrls } from "../../../packages/bruniai/src/compare-urls.js";
import type { ComparisonService } from "../../../packages/mcp-server/src/types.js";

export const nextComparisonService: ComparisonService = {
  compareUrls,
  compareImages,
};
