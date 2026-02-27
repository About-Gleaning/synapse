import { GenericWebPageIngestor } from "./generic-web-ingestor";
import type { IngestSourceReq, IngestedMaterialResult, SourceIngestor } from "./types";

export class WechatArticleIngestor implements SourceIngestor {
  private readonly genericIngestor = new GenericWebPageIngestor();

  canHandle(req: IngestSourceReq): boolean {
    if (req.sourceTypeHint && req.sourceTypeHint !== "auto") {
      return req.sourceTypeHint === "wechat_article";
    }
    return req.sourceUrl.includes("mp.weixin.qq.com");
  }

  async ingest(req: IngestSourceReq): Promise<IngestedMaterialResult> {
    const result = await this.genericIngestor.ingest({
      sourceUrl: req.sourceUrl,
      sourceTypeHint: "web_page",
    });
    return {
      ...result,
      sourceType: "wechat_article",
    };
  }
}
