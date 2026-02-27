export type IngestSourceType = "web_page" | "wechat_article" | "xiaohongshu_post";
export type IngestContentKind = "article" | "audio" | "video";

export interface IngestSourceReq {
  sourceUrl: string;
  sourceTypeHint?: IngestSourceType | "auto";
}

export interface IngestedMaterialResult {
  sourceType: IngestSourceType;
  contentKind: IngestContentKind;
  title: string;
  htmlContent: string;
  markdownContent: string;
  plainTextContent: string;
  imageAssets: Array<{
    originalUrl: string;
    localFilename: string;
  }>;
}

export interface SourceIngestor {
  canHandle(req: IngestSourceReq): boolean;
  ingest(req: IngestSourceReq): Promise<IngestedMaterialResult>;
}
