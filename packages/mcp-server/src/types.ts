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
  bruniToken?: string;
  mcpToken?: string;
  mcpAuthContext?: McpAuthContext;
  mcpInternalSecret?: string;
  bruniApiUrl?: string;
  comparisonMode?: "url-to-url" | "image-to-url" | "image-to-image";
  prNumber?: string;
  repository?: string;
}

export interface McpAuthContext {
  userId: string;
  tokenId: string;
  scopes: string[];
  mcpToken?: string;
  teamId?: string;
  projectId?: string;
}

export type McpAuthVerifier = (token: string) => Promise<McpAuthContext | null>;

export interface ComparisonService {
  compareUrls(input: CompareUrlsRequest): Promise<unknown>;
  compareImageToUrl(input: CompareImageToUrlRequest): Promise<unknown>;
  sendReport(input: SendReportRequest): Promise<string | null>;
}
