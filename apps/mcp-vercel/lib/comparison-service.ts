import { compareImageToUrl, compareUrls, sendReport } from "bruniai";
import type { ComparisonService } from "bruniai-mcp-server";

export const nextComparisonService: ComparisonService = {
  compareUrls,
  compareImageToUrl,
  sendReport,
};
