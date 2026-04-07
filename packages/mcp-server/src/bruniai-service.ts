import {
  compareImageToUrl,
  compareUrls,
} from "bruniai";
import type { ComparisonService } from "./types.js";

export const bruniaiComparisonService: ComparisonService = {
  compareUrls(input) {
    return compareUrls(input);
  },
  compareImageToUrl(input) {
    return compareImageToUrl(input);
  },
};
