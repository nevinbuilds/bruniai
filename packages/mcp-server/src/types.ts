export interface CompareUrlsRequest {
  baseUrl: string;
  previewUrl: string;
  page?: string;
}

export interface CompareImagesRequest {
  baseImage: string;
  previewImage: string;
}

export interface ComparisonService {
  compareUrls(input: CompareUrlsRequest): Promise<unknown>;
  compareImages(input: CompareImagesRequest): Promise<unknown>;
}
