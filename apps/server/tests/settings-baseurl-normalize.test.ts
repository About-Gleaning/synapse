import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getInternalSettings, updateSettings } from "../src/core/settings";
import { createDb } from "../src/db/database";

test("保存设置时应自动去除 baseUrl 的 /chat/completions 后缀", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "synapse-settings-test-"));
  const dbPath = path.join(workspace, "test.sqlite");
  const db = createDb(dbPath);

  try {
    updateSettings(db.conn, {
      knowledgeRoot: path.join(workspace, "knowledge-root"),
      llmProvider: {
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        apiKey: "test-key",
        model: "qwen3-omni-flash",
      },
    });

    const settings = getInternalSettings(db.conn);
    assert.equal(settings.llmProvider.baseUrl, "https://dashscope.aliyuncs.com/compatible-mode/v1");
  } finally {
    db.close();
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("读取历史配置时应自动纠偏 baseUrl 并回写数据库", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "synapse-settings-test-"));
  const dbPath = path.join(workspace, "test.sqlite");
  const db = createDb(dbPath);
  const knowledgeRoot = path.join(workspace, "knowledge-root");

  try {
    db.conn
      .prepare("INSERT INTO app_settings(key, value_json, updated_at) VALUES(?, ?, ?)")
      .run(
        "settings",
        JSON.stringify({
          knowledgeRoot,
          llmProvider: {
            baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
            apiKey: "test-key",
            model: "qwen3-omni-flash",
          },
          retrieval: {
            briefTitleWeight: 0.35,
            briefSummaryWeight: 0.45,
            categoryWeight: 0.2,
            detailedNeedsOriginalThreshold: 0.2,
          },
        }),
        new Date().toISOString(),
      );

    const settings = getInternalSettings(db.conn);
    assert.equal(settings.llmProvider.baseUrl, "https://dashscope.aliyuncs.com/compatible-mode/v1");

    const persisted = db.conn
      .prepare("SELECT value_json FROM app_settings WHERE key = ?")
      .get("settings") as { value_json: string };
    const persistedJson = JSON.parse(persisted.value_json) as {
      llmProvider?: { baseUrl?: string };
    };
    assert.equal(persistedJson.llmProvider?.baseUrl, "https://dashscope.aliyuncs.com/compatible-mode/v1");
  } finally {
    db.close();
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
