import {
  compareImages,
  compareUrls,
} from "bruniai";
import type { ComparisonService } from "./types.js";

export const bruniaiComparisonService: ComparisonService = {
  compareUrls(input) {
    return compareUrls(input);
  },
  compareImages(input) {
    return compareImages(input);
  },
};
