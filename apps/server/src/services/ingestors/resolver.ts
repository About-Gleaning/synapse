import { GenericWebPageIngestor } from "./generic-web-ingestor";
import { WechatArticleIngestor } from "./wechat-ingestor";
import { XiaohongshuIngestor } from "./xiaohongshu-ingestor";
import type { IngestSourceReq, SourceIngestor } from "./types";

const INGESTORS: SourceIngestor[] = [
  new WechatArticleIngestor(),
  new XiaohongshuIngestor(),
  new GenericWebPageIngestor(),
];

export function resolveIngestor(req: IngestSourceReq): SourceIngestor {
  const found = INGESTORS.find((x) => x.canHandle(req));
  if (!found) {
    throw new Error("SOURCE_NOT_SUPPORTED");
  }
  return found;
}
