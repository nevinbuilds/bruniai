import { compareImages } from "../../../packages/bruniai/src/compare-images";
import { compareUrls } from "../../../packages/bruniai/src/compare-urls";

interface ComparisonService {
  compareUrls(input: {
    baseUrl: string;
    previewUrl: string;
    page?: string;
  }): Promise<unknown>;
  compareImages(input: {
    baseImage: string;
    previewImage: string;
  }): Promise<unknown>;
}

export const nextComparisonService: ComparisonService = {
  compareUrls,
  compareImages,
};
