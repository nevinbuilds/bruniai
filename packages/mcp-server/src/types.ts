export interface CompareUrlsRequest {
  baseUrl: string;
  previewUrl: string;
  page?: string;
  sectionExplanationMode?: "fast" | "detailed" | "off";
}

export interface CompareImageToUrlRequest {
  baseImageSource: string;
  previewUrl: string;
  page?: string;
  sectionExplanationMode?: "fast" | "detailed" | "off";
}

export interface ComparisonService {
  compareUrls(input: CompareUrlsRequest): Promise<unknown>;
  compareImageToUrl(input: CompareImageToUrlRequest): Promise<unknown>;
}
