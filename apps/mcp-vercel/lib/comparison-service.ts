import { compareImages, compareUrls } from "bruniai";
import type { ComparisonService } from "bruniai-mcp-server";

export const nextComparisonService: ComparisonService = {
  compareUrls,
  compareImages,
};
