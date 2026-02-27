import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type Database from "better-sqlite3";
import { createDb } from "../src/db/database";
import { RetrievalService, type BriefCandidate } from "../src/services/retrieval-service";

interface TestContext {
  conn: Database.Database;
  retrievalService: RetrievalService;
  workspace: string;
  cleanup: () => void;
}

function setupTestContext(): TestContext {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "synapse-retrieval-test-"));
  const dbPath = path.join(workspace, "test.sqlite");
  const dbClient = createDb(dbPath);
  return {
    conn: dbClient.conn,
    retrievalService: new RetrievalService(dbClient.conn),
    workspace,
    cleanup: () => {
      dbClient.close();
      fs.rmSync(workspace, { recursive: true, force: true });
    },
  };
}

function seedMaterial(
  conn: Database.Database,
  workspace: string,
  materialId: string,
  detailedNotesContent: string,
  detailedTokens = "",
): string {
  const folderPath = path.join(workspace, materialId);
  fs.mkdirSync(path.join(folderPath, "ai"), { recursive: true });
  fs.writeFileSync(path.join(folderPath, "ai", "detailed_notes.md"), detailedNotesContent, "utf-8");

  const now = "2026-02-27T00:00:00.000Z";
  conn
    .prepare(
      `INSERT INTO materials(
        id, title, source_type, content_kind, original_url, canonical_url, content_hash, folder_path,
        status, ingest_stage, brief_summary_status, detailed_notes_status, classify_status,
        created_at, updated_at
      ) VALUES(?, ?, 'web', 'article', ?, ?, ?, ?, 'ready', 'completed', 'completed', 'completed', 'completed', ?, ?)`,
    )
    .run(
      materialId,
      `title-${materialId}`,
      `https://example.com/${materialId}`,
      `https://example.com/${materialId}`,
      `hash-${materialId}`,
      folderPath,
      now,
      now,
    );
  conn
    .prepare(
      `INSERT INTO material_search_fts(
        material_id, title_tokens, brief_summary_tokens, detailed_notes_tokens, category_tokens
      ) VALUES(?, '', '', ?, '')`,
    )
    .run(materialId, detailedTokens);

  return folderPath;
}

function buildCandidate(materialId: string, briefScore: number): BriefCandidate {
  return {
    materialId,
    title: `title-${materialId}`,
    briefScore,
    briefSummary: "",
    categoryPaths: [],
  };
}

test("详细整理强命中时原文补充配额收敛为 1", () => {
  const ctx = setupTestContext();
  try {
    seedMaterial(ctx.conn, ctx.workspace, "mat1", "vector retrieval note", "vector retrieval strategy");
    seedMaterial(ctx.conn, ctx.workspace, "mat2", "");
    seedMaterial(ctx.conn, ctx.workspace, "mat3", "");

    const result = ctx.retrievalService.rerankByDetailed(
      "vector retrieval strategy",
      [buildCandidate("mat1", 0.8), buildCandidate("mat2", 0.7), buildCandidate("mat3", 0.65)],
      3,
      {
        detailedNeedsOriginalThreshold: 0.5,
        briefTitleWeight: 0.3,
        briefSummaryWeight: 0.5,
        categoryWeight: 0.2,
      },
    );

    assert.equal(result.length, 3);
    assert.equal(result[0].materialId, "mat1");
    assert.equal(result[0].needsOriginal, false);
    assert.match(result[0].originalDecision, /详细整理命中阈值/);

    assert.equal(result[1].needsOriginal, true);
    assert.match(result[1].originalDecision, /详细整理缺失，补充原文/);

    assert.equal(result[2].needsOriginal, false);
    assert.match(result[2].originalDecision, /原文配额已用尽\(1\)/);
  } finally {
    ctx.cleanup();
  }
});

test("详细整理普遍偏弱时原文补充最多 2 份", () => {
  const ctx = setupTestContext();
  try {
    seedMaterial(ctx.conn, ctx.workspace, "matA", "");
    seedMaterial(ctx.conn, ctx.workspace, "matB", "");
    seedMaterial(ctx.conn, ctx.workspace, "matC", "");

    const result = ctx.retrievalService.rerankByDetailed(
      "hybrid search fallback",
      [buildCandidate("matA", 0.6), buildCandidate("matB", 0.55), buildCandidate("matC", 0.5)],
      3,
      {
        detailedNeedsOriginalThreshold: 0.8,
        briefTitleWeight: 0.3,
        briefSummaryWeight: 0.5,
        categoryWeight: 0.2,
      },
    );

    assert.equal(result.length, 3);
    assert.equal(result[0].needsOriginal, true);
    assert.equal(result[1].needsOriginal, true);
    assert.equal(result[2].needsOriginal, false);
    assert.match(result[2].originalDecision, /原文配额已用尽\(2\)/);
  } finally {
    ctx.cleanup();
  }
});

test("全部因精简分数过低而跳过时，触发兜底原文读取", () => {
  const ctx = setupTestContext();
  try {
    seedMaterial(ctx.conn, ctx.workspace, "matX", "");
    seedMaterial(ctx.conn, ctx.workspace, "matY", "");

    const result = ctx.retrievalService.rerankByDetailed(
      "unmatched query",
      [buildCandidate("matX", 0.1), buildCandidate("matY", 0.05)],
      2,
      {
        detailedNeedsOriginalThreshold: 0.6,
        briefTitleWeight: 0.3,
        briefSummaryWeight: 0.5,
        categoryWeight: 0.2,
      },
    );

    assert.equal(result.length, 2);
    assert.equal(result[0].needsOriginal, true);
    assert.equal(result[0].originalDecision, "详细整理不可用，触发兜底原文读取");
    assert.equal(result[1].needsOriginal, false);
    assert.match(result[1].originalDecision, /精简相关度过低/);
  } finally {
    ctx.cleanup();
  }
});
