import assert from "node:assert/strict";
import test from "node:test";
import { OpenAiCompatibleProvider } from "../src/services/llm-provider";

test("baseUrl 为根路径时，应请求 /chat/completions", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "ok" } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const provider = new OpenAiCompatibleProvider({
      baseUrl: "https://llm.local/v1",
      apiKey: "test-key",
      model: "mock-model",
    });

    await provider.generate({
      model: "",
      messages: [{ role: "user", content: "hello" }],
      options: { allowFallback: false },
    });

    assert.equal(calls[0], "https://llm.local/v1/chat/completions");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("baseUrl 已包含 /chat/completions 时，不应重复拼接", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "ok" } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const provider = new OpenAiCompatibleProvider({
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      apiKey: "test-key",
      model: "qwen3-omni-flash",
    });

    await provider.generate({
      model: "",
      messages: [{ role: "user", content: "hello" }],
      options: { allowFallback: false },
    });

    assert.equal(calls[0], "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
