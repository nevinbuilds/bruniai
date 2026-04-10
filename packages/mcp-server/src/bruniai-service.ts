import type { ComparisonService, SendReportRequest } from "./types.js";

type BruniaiModule = {
  compareUrls: ComparisonService["compareUrls"];
  compareImageToUrl: ComparisonService["compareImageToUrl"];
  sendReport?: (input: SendReportRequest) => Promise<string | null>;
};

const BRUNIAI_MODULE_ID = "bruniai";
let bruniaiModuleLoader: (() => Promise<BruniaiModule>) | null = null;

async function loadBruniaiModule(): Promise<BruniaiModule> {
  if (bruniaiModuleLoader) {
    return bruniaiModuleLoader();
  }

  return (await import(BRUNIAI_MODULE_ID)) as BruniaiModule;
}

export function setBruniaiModuleLoaderForTests(
  loader: (() => Promise<BruniaiModule>) | null,
): void {
  bruniaiModuleLoader = loader;
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
  async sendReport(input) {
    const mod = await loadBruniaiModule();
    if (!mod.sendReport) {
      throw new Error("sendReport is not available in the bruniai module");
    }
    return mod.sendReport(input);
  },
};
