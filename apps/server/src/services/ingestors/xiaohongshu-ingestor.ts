import { GenericWebPageIngestor } from "./generic-web-ingestor";
import type { IngestSourceReq, IngestedMaterialResult, SourceIngestor } from "./types";

export class XiaohongshuIngestor implements SourceIngestor {
  private readonly genericIngestor = new GenericWebPageIngestor();

  canHandle(req: IngestSourceReq): boolean {
    if (req.sourceTypeHint && req.sourceTypeHint !== "auto") {
      return req.sourceTypeHint === "xiaohongshu_post";
    }
    return req.sourceUrl.includes("xiaohongshu.com") || req.sourceUrl.includes("xhslink.com");
  }

  async ingest(req: IngestSourceReq): Promise<IngestedMaterialResult> {
    const result = await this.genericIngestor.ingest({
      sourceUrl: req.sourceUrl,
      sourceTypeHint: "web_page",
    });
    return {
      ...result,
      sourceType: "xiaohongshu_post",
    };
  }
}
