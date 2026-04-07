import type { ComparisonService } from "./types.js";

type BruniaiModule = {
  compareUrls: ComparisonService["compareUrls"];
  compareImageToUrl: ComparisonService["compareImageToUrl"];
};

const BRUNIAI_MODULE_ID = "bruniai";

async function loadBruniaiModule(): Promise<BruniaiModule> {
  return (await import(BRUNIAI_MODULE_ID)) as BruniaiModule;
}

export const bruniaiComparisonService: ComparisonService = {
  async compareUrls(input) {
    const { compareUrls } = await loadBruniaiModule();
    return compareUrls(input);
  },
  async compareImageToUrl(input) {
    const { compareImageToUrl } = await loadBruniaiModule();
    return compareImageToUrl(input);
  },
};
