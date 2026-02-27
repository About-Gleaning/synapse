import { htmlToMarkdownDoc, replaceMarkdownImageUrls } from "../../utils/text";
import { validatePublicUrl } from "../../utils/url";
import type { IngestSourceReq, IngestedMaterialResult, SourceIngestor } from "./types";

export class GenericWebPageIngestor implements SourceIngestor {
  canHandle(req: IngestSourceReq): boolean {
    if (req.sourceTypeHint && req.sourceTypeHint !== "auto") {
      return req.sourceTypeHint === "web_page";
    }
    return true;
  }

  async ingest(req: IngestSourceReq): Promise<IngestedMaterialResult> {
    const validated = await validatePublicUrl(req.sourceUrl);
    const html = await fetchHtmlWithSafeRedirect(validated.toString());
    const converted = htmlToMarkdownDoc(html, "", validated.toString());

    const imageAssets: Array<{ originalUrl: string; localFilename: string }> = [];
    const markdown = replaceMarkdownImageUrls(converted.markdown, (url) => {
      const filename = buildImageFilename(url, imageAssets.length + 1);
      imageAssets.push({ originalUrl: url, localFilename: filename });
      return `./assets/${filename}`;
    });

    return {
      sourceType: "web_page",
      contentKind: "article",
      title: converted.title,
      htmlContent: html,
      markdownContent: markdown,
      plainTextContent: converted.plainText,
      imageAssets,
    };
  }
}

async function fetchHtmlWithSafeRedirect(url: string, maxRedirect = 5): Promise<string> {
  let current = url;

  for (let i = 0; i <= maxRedirect; i += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const resp = await fetch(current, {
        method: "GET",
        headers: {
          "User-Agent": "SynapseBot/0.1",
        },
        redirect: "manual",
        signal: controller.signal,
      });

      if (resp.status >= 300 && resp.status < 400) {
        const location = resp.headers.get("location");
        if (!location) {
          throw new Error("INGEST_FETCH_FAILED");
        }
        const next = new URL(location, current).toString();
        await validatePublicUrl(next);
        current = next;
        continue;
      }

      if (!resp.ok) {
        throw new Error("INGEST_FETCH_FAILED");
      }

      return await resp.text();
    } catch {
      throw new Error("INGEST_FETCH_FAILED");
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("INGEST_FETCH_FAILED");
}

function buildImageFilename(url: string, seq: number): string {
  const ext = pickExt(url);
  return `img_${String(seq).padStart(3, "0")}${ext}`;
}

function pickExt(url: string): string {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".png")) {
    return ".png";
  }
  if (clean.endsWith(".gif")) {
    return ".gif";
  }
  if (clean.endsWith(".webp")) {
    return ".webp";
  }
  if (clean.endsWith(".jpeg") || clean.endsWith(".jpg")) {
    return ".jpg";
  }
  if (clean.endsWith(".svg")) {
    return ".svg";
  }
  return ".jpg";
}
