import assert from "node:assert/strict";
import test from "node:test";
import { resolveGenerateTimeoutMs } from "../src/services/llm-provider";

test("短输入保持 30 秒超时，避免无谓等待", () => {
  const timeout = resolveGenerateTimeoutMs({
    model: "",
    systemPrompt: "你是助手",
    messages: [{ role: "user", content: "请总结这段话" }],
    options: { allowFallback: false },
  });
  assert.equal(timeout, 30_000);
});

test("中等输入提升到 90 秒，降低详细整理中断风险", () => {
  const timeout = resolveGenerateTimeoutMs({
    model: "",
    systemPrompt: "你是助手",
    messages: [{ role: "user", content: "a".repeat(6_100) }],
    options: { allowFallback: false },
  });
  assert.equal(timeout, 90_000);
});

test("超长输入提升到 120 秒，支持大篇幅资料整理", () => {
  const timeout = resolveGenerateTimeoutMs({
    model: "",
    systemPrompt: "你是助手",
    messages: [{ role: "user", content: "a".repeat(12_200) }],
    options: { allowFallback: false },
  });
  assert.equal(timeout, 120_000);
});
