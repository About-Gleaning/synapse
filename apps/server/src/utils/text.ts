import crypto from "node:crypto";

export interface HtmlToMarkdownResult {
  title: string;
  markdown: string;
  plainText: string;
  imageUrls: string[];
}

export function extractTitle(html: string): string {
  const matched = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!matched) {
    return "未命名资料";
  }
  return decodeHtml(matched[1]).trim() || "未命名资料";
}

export function htmlToText(html: string): string {
  return markdownToPlainText(htmlToMarkdownDoc(html, "", undefined).markdown);
}

export function textToMarkdown(title: string, text: string): string {
  const paragraphs = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const body = paragraphs.map((line) => `${line}\n`).join("\n");
  return `# ${title}\n\n${body}`;
}

export function htmlToMarkdownDoc(
  html: string,
  fallbackTitle: string,
  baseUrl?: string,
): HtmlToMarkdownResult {
  const title = extractTitle(html) || fallbackTitle || "未命名资料";
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  const imageUrls = collectImageUrls(cleaned, baseUrl);

  let md = cleaned;

  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_m, code) => {
    return `\n\n\
\`\`\`\n${decodeHtml(code).trim()}\n\`\`\`\n\n`;
  });

  md = md.replace(/<(h1|h2|h3|h4|h5|h6)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, tag, content) => {
    const level = Number(tag.replace("h", ""));
    const marks = "#".repeat(Math.max(1, Math.min(6, level)));
    return `\n\n${marks} ${stripInlineTags(content)}\n\n`;
  });

  md = md.replace(/<img[^>]*>/gi, (raw) => {
    const src = pickAttr(raw, "src");
    const alt = pickAttr(raw, "alt") || "image";
    const resolved = resolveUrl(src, baseUrl) || src;
    if (!resolved) {
      return "";
    }
    return `\n\n![${escapeMd(alt)}](${resolved})\n\n`;
  });

  md = md.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, text) => {
    const resolved = resolveUrl(href, baseUrl) || href;
    const label = stripInlineTags(text) || resolved;
    return `[${escapeMd(label)}](${resolved})`;
  });

  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, content) => {
    return `\n- ${stripInlineTags(content)}`;
  });

  md = md
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|section|article|blockquote|ul|ol|table|tr)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ");

  md = decodeHtml(md)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!md.startsWith("# ")) {
    md = `# ${title}\n\n${md}`;
  }

  return {
    title,
    markdown: md,
    plainText: markdownToPlainText(md),
    imageUrls,
  };
}

export function replaceMarkdownImageUrls(markdown: string, mapper: (url: string) => string): string {
  return markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
    const mapped = mapper(url);
    return `![${alt}](${mapped})`;
  });
}

export function markdownToPlainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+\]\(([^)]+)\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/`/g, "")
    .replace(/\n{2,}/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

export function contentHash(text: string): string {
  return crypto.createHash("sha256").update(normalizeText(text)).digest("hex");
}

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function tokenizeForSearch(text: string): string[] {
  const normalized = normalizeText(text);
  const latinTokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  const cjkChars = normalized.match(/[\u4e00-\u9fa5]/g) ?? [];
  const grams: string[] = [];
  for (let i = 0; i < cjkChars.length - 1; i += 1) {
    grams.push(cjkChars[i] + cjkChars[i + 1]);
  }
  return Array.from(new Set([...latinTokens, ...grams]));
}

export function splitForStreaming(text: string, chunkSize = 24): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

function decodeHtml(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function pickAttr(raw: string, name: string): string {
  const reg = new RegExp(`${name}=["']([^"']+)["']`, "i");
  const matched = raw.match(reg);
  return matched?.[1]?.trim() ?? "";
}

function stripInlineTags(raw: string): string {
  return decodeHtml(raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function escapeMd(text: string): string {
  return text.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function collectImageUrls(html: string, baseUrl?: string): string[] {
  const urls = new Set<string>();
  html.replace(/<img[^>]*>/gi, (raw) => {
    const src = pickAttr(raw, "src");
    const resolved = resolveUrl(src, baseUrl);
    if (resolved) {
      urls.add(resolved);
    }
    return raw;
  });
  return Array.from(urls);
}

function resolveUrl(raw: string, baseUrl?: string): string {
  if (!raw) {
    return "";
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  if (!baseUrl) {
    return raw;
  }
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return raw;
  }
}
