export interface CompareUrlsRequest {
  baseUrl: string;
  previewUrl: string;
  page?: string;
  sectionExplanationMode?: "fast" | "detailed" | "off";
  prNumber?: string;
  repository?: string;
}

export interface CompareImageToUrlRequest {
  baseImageSource: string;
  previewUrl: string;
  page?: string;
  sectionExplanationMode?: "fast" | "detailed" | "off";
  prNumber?: string;
  repository?: string;
}

export interface SendReportRequest {
  result: unknown;
  page: string;
  baseUrl: string;
  previewUrl: string;
  bruniToken: string;
  bruniApiUrl?: string;
  comparisonMode?: "url-to-url" | "image-to-url" | "image-to-image";
  prNumber?: string;
  repository?: string;
}

export interface ComparisonService {
  compareUrls(input: CompareUrlsRequest): Promise<unknown>;
  compareImageToUrl(input: CompareImageToUrlRequest): Promise<unknown>;
  sendReport(input: SendReportRequest): Promise<string | null>;
}
