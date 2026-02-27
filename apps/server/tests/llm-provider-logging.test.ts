import assert from "node:assert/strict";
import test from "node:test";
import { OpenAiCompatibleProvider, type LlmProviderLogger } from "../src/services/llm-provider";

interface CapturedLog {
  level: "info" | "error";
  payload: Record<string, unknown>;
  message?: string;
}

function createLogger(logs: CapturedLog[]): LlmProviderLogger {
  return {
    info: (obj, message) => {
      logs.push({ level: "info", payload: obj, message });
    },
    error: (obj, message) => {
      logs.push({ level: "error", payload: obj, message });
    },
  };
}

function mockSuccessFetch(): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "ok" } }],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 8,
          total_tokens: 20,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function setEnv(vars: { NODE_ENV?: string; SYNAPSE_LLM_PROMPT_LOG_ENABLED?: string }): () => void {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevPromptLog = process.env.SYNAPSE_LLM_PROMPT_LOG_ENABLED;
  if (vars.NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = vars.NODE_ENV;
  }
  if (vars.SYNAPSE_LLM_PROMPT_LOG_ENABLED === undefined) {
    delete process.env.SYNAPSE_LLM_PROMPT_LOG_ENABLED;
  } else {
    process.env.SYNAPSE_LLM_PROMPT_LOG_ENABLED = vars.SYNAPSE_LLM_PROMPT_LOG_ENABLED;
  }
  return () => {
    if (prevNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = prevNodeEnv;
    }
    if (prevPromptLog === undefined) {
      delete process.env.SYNAPSE_LLM_PROMPT_LOG_ENABLED;
    } else {
      process.env.SYNAPSE_LLM_PROMPT_LOG_ENABLED = prevPromptLog;
    }
  };
}

function findLog(logs: CapturedLog[], event: string, level: "info" | "error" = "info"): CapturedLog | undefined {
  return logs.find((x) => x.level === level && x.payload.event === event);
}

test("开发环境默认记录完整 prompt", async () => {
  const restoreEnv = setEnv({ NODE_ENV: "development", SYNAPSE_LLM_PROMPT_LOG_ENABLED: undefined });
  const restoreFetch = mockSuccessFetch();
  const logs: CapturedLog[] = [];

  try {
    const provider = new OpenAiCompatibleProvider(
      {
        baseUrl: "https://llm.local/v1?token=abc",
        apiKey: "test-key",
        model: "model-a",
      },
      createLogger(logs),
    );

    await provider.generate({
      model: "",
      systemPrompt: "你是助手",
      messages: [{ role: "user", content: "请总结这段内容" }],
      options: { allowFallback: false },
    });

    const requestLog = findLog(logs, "llm.request");
    assert.ok(requestLog);
    assert.equal(requestLog.payload.model, "model-a");
    assert.equal(requestLog.payload.baseUrl, "https://llm.local/v1");
    const prompt = requestLog.payload.prompt as { systemPrompt?: string; messages?: Array<{ content: string }> };
    assert.equal(prompt.systemPrompt, "你是助手");
    assert.equal(prompt.messages?.[0]?.content, "请总结这段内容");
    assert.doesNotMatch(JSON.stringify(logs), /test-key/);
  } finally {
    restoreFetch();
    restoreEnv();
  }
});

test("生产环境默认不记录 prompt 原文", async () => {
  const restoreEnv = setEnv({ NODE_ENV: "production", SYNAPSE_LLM_PROMPT_LOG_ENABLED: undefined });
  const restoreFetch = mockSuccessFetch();
  const logs: CapturedLog[] = [];

  try {
    const provider = new OpenAiCompatibleProvider(
      {
        baseUrl: "https://llm.local/v1",
        apiKey: "test-key",
        model: "model-a",
      },
      createLogger(logs),
    );

    await provider.generate({
      model: "",
      systemPrompt: "你是助手",
      messages: [{ role: "user", content: "请总结这段内容" }],
      options: { allowFallback: false },
    });

    const requestLog = findLog(logs, "llm.request");
    assert.ok(requestLog);
    assert.equal(requestLog.payload.prompt, undefined);
  } finally {
    restoreFetch();
    restoreEnv();
  }
});

test("生产环境显式开启开关时记录 prompt", async () => {
  const restoreEnv = setEnv({ NODE_ENV: "production", SYNAPSE_LLM_PROMPT_LOG_ENABLED: "true" });
  const restoreFetch = mockSuccessFetch();
  const logs: CapturedLog[] = [];

  try {
    const provider = new OpenAiCompatibleProvider(
      {
        baseUrl: "https://llm.local/v1",
        apiKey: "test-key",
        model: "model-a",
      },
      createLogger(logs),
    );

    await provider.generate({
      model: "",
      systemPrompt: "你是助手",
      messages: [{ role: "user", content: "请总结这段内容" }],
      options: { allowFallback: false },
    });

    const requestLog = findLog(logs, "llm.request");
    assert.ok(requestLog);
    assert.ok(requestLog.payload.prompt);
  } finally {
    restoreFetch();
    restoreEnv();
  }
});

test("降级与失败路径都应输出可观测日志", async () => {
  const restoreEnv = setEnv({ NODE_ENV: "development", SYNAPSE_LLM_PROMPT_LOG_ENABLED: undefined });
  const logs: CapturedLog[] = [];

  try {
    const provider = new OpenAiCompatibleProvider(
      {
        baseUrl: "https://llm.local/v1",
        apiKey: "",
        model: "model-a",
      },
      createLogger(logs),
    );

    const fallbackResp = await provider.generate({
      model: "",
      messages: [{ role: "user", content: "hello" }],
      options: { allowFallback: true },
    });
    assert.equal(fallbackResp.meta?.provider, "mock");

    const fallbackLog = findLog(logs, "llm.response");
    assert.ok(fallbackLog);
    assert.equal(fallbackLog.payload.status, "fallback");
    assert.equal(fallbackLog.payload.fallbackReason, "NO_API_KEY");

    await assert.rejects(async () => {
      await provider.generate({
        model: "",
        messages: [{ role: "user", content: "hello" }],
        options: { allowFallback: false },
      });
    });
    const errorLog = findLog(logs, "llm.error", "error");
    assert.ok(errorLog);
    assert.equal(errorLog.payload.fallbackReason, "NO_API_KEY");
  } finally {
    restoreEnv();
  }
});
