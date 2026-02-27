import assert from "node:assert/strict";
import test from "node:test";
import { WechatArticleIngestor } from "../src/services/ingestors/wechat-ingestor";
import { XiaohongshuIngestor } from "../src/services/ingestors/xiaohongshu-ingestor";

function createFetchMock(): typeof fetch {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url === "http://93.184.216.34/wechat-article") {
      return new Response(
        `<!doctype html><html><head><title>公众号测试文章</title></head><body>
           <article>
             <h1>公众号测试文章</h1>
             <p>这是公众号内容抓取测试。</p>
             <img src="/images/wechat.png" alt="wechat">
           </article>
         </body></html>`,
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    if (url === "http://93.184.216.34/xhs-post") {
      return new Response(
        `<!doctype html><html><head><title>小红书测试笔记</title></head><body>
           <article>
             <h1>小红书测试笔记</h1>
             <p>这是小红书抓取测试内容。</p>
           </article>
         </body></html>`,
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    throw new Error(`FETCH_NOT_MOCKED:${url}`);
  };
}

test("公众号抓取器：显式类型提示时可导入并保留 sourceType", async () => {
  const ingestor = new WechatArticleIngestor();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createFetchMock();

  try {
    assert.equal(
      ingestor.canHandle({
        sourceUrl: "http://93.184.216.34/wechat-article",
        sourceTypeHint: "wechat_article",
      }),
      true,
    );

    const result = await ingestor.ingest({
      sourceUrl: "http://93.184.216.34/wechat-article",
      sourceTypeHint: "wechat_article",
    });

    assert.equal(result.sourceType, "wechat_article");
    assert.equal(result.title, "公众号测试文章");
    assert.equal(result.imageAssets.length, 1);
    assert.equal(result.imageAssets[0].originalUrl, "http://93.184.216.34/images/wechat.png");
    assert.match(result.markdownContent, /公众号测试文章/);
    assert.match(result.markdownContent, /!\[wechat\]\(\.\/assets\/img_001\.png\)/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("小红书抓取器：显式类型提示时可导入并保留 sourceType", async () => {
  const ingestor = new XiaohongshuIngestor();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createFetchMock();

  try {
    assert.equal(
      ingestor.canHandle({
        sourceUrl: "http://93.184.216.34/xhs-post",
        sourceTypeHint: "xiaohongshu_post",
      }),
      true,
    );

    const result = await ingestor.ingest({
      sourceUrl: "http://93.184.216.34/xhs-post",
      sourceTypeHint: "xiaohongshu_post",
    });

    assert.equal(result.sourceType, "xiaohongshu_post");
    assert.equal(result.title, "小红书测试笔记");
    assert.match(result.plainTextContent, /小红书抓取测试内容/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("平台抓取器：当 sourceTypeHint=web_page 时不应被平台域名强制接管", () => {
  const wechatIngestor = new WechatArticleIngestor();
  const xhsIngestor = new XiaohongshuIngestor();

  assert.equal(
    wechatIngestor.canHandle({
      sourceUrl: "https://mp.weixin.qq.com/s/demo",
      sourceTypeHint: "web_page",
    }),
    false,
  );
  assert.equal(
    xhsIngestor.canHandle({
      sourceUrl: "https://www.xiaohongshu.com/explore/demo",
      sourceTypeHint: "web_page",
    }),
    false,
  );
});

test("平台抓取器：auto 模式下按域名识别平台来源", () => {
  const wechatIngestor = new WechatArticleIngestor();
  const xhsIngestor = new XiaohongshuIngestor();

  assert.equal(
    wechatIngestor.canHandle({
      sourceUrl: "https://mp.weixin.qq.com/s/demo",
      sourceTypeHint: "auto",
    }),
    true,
  );
  assert.equal(
    xhsIngestor.canHandle({
      sourceUrl: "https://xhslink.com/demo",
      sourceTypeHint: "auto",
    }),
    true,
  );
});
