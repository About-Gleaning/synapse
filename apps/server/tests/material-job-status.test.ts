import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type Database from "better-sqlite3";
import { updateSettings } from "../src/core/settings";
import { createDb } from "../src/db/database";
import { AiTaskService } from "../src/services/ai-task-service";
import { CategoryService } from "../src/services/category-service";
import { JobService, type JobEntity } from "../src/services/job-service";
import { MaterialService } from "../src/services/material-service";

interface TestContext {
  conn: Database.Database;
  knowledgeRoot: string;
  categoryService: CategoryService;
  jobService: JobService;
  materialService: MaterialService;
  aiTaskService: AiTaskService;
  cleanup: () => void;
}

interface SeedMaterialOptions {
  id: string;
  folderPath?: string;
  status: "ingesting" | "processing_ai" | "ready" | "failed";
  ingestStage: "db_persisting" | "completed" | "failed";
  briefSummaryStatus: "pending" | "queued" | "running" | "done" | "failed";
  detailedNotesStatus: "pending" | "queued" | "running" | "done" | "failed";
  classifyStatus: "pending" | "queued" | "running" | "done" | "failed";
  errorMessage?: string | null;
  createMaterialDirs?: boolean;
  createSourceMd?: boolean;
}

function setupTestContext(): TestContext {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "synapse-material-job-test-"));
  const dbPath = path.join(workspace, "test.sqlite");
  const knowledgeRoot = path.join(workspace, "knowledge-root");
  const dbClient = createDb(dbPath);

  updateSettings(dbClient.conn, {
    knowledgeRoot,
  });

  const categoryService = new CategoryService(dbClient.conn);
  categoryService.ensureDefaults();
  const jobService = new JobService(dbClient.conn);
  const materialService = new MaterialService(dbClient.conn, jobService, categoryService);
  const aiTaskService = new AiTaskService(dbClient.conn, materialService, categoryService);

  return {
    conn: dbClient.conn,
    knowledgeRoot,
    categoryService,
    jobService,
    materialService,
    aiTaskService,
    cleanup: () => {
      dbClient.close();
      fs.rmSync(workspace, { recursive: true, force: true });
    },
  };
}

function seedMaterial(ctx: TestContext, options: SeedMaterialOptions): { id: string; folderPath: string } {
  const folderPath = options.folderPath ?? path.join(ctx.knowledgeRoot, "materials", "2026", "02", options.id);
  if (options.createMaterialDirs !== false) {
    fs.mkdirSync(path.join(folderPath, "source"), { recursive: true });
    fs.mkdirSync(path.join(folderPath, "ai"), { recursive: true });
    fs.mkdirSync(path.join(folderPath, "chats"), { recursive: true });
    fs.mkdirSync(path.join(folderPath, "logs"), { recursive: true });
  }
  if (options.createSourceMd !== false && options.createMaterialDirs !== false) {
    fs.writeFileSync(path.join(folderPath, "source", "source.md"), `# source for ${options.id}\n`, "utf-8");
  }

  const now = "2026-02-27T10:00:00.000Z";
  ctx.conn
    .prepare(
      `INSERT INTO materials(
        id, title, source_type, content_kind, original_url, canonical_url, content_hash,
        folder_path, status, ingest_stage, brief_summary_status, detailed_notes_status, classify_status,
        error_message, created_at, updated_at
      ) VALUES(?, ?, 'web_page', 'article', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      options.id,
      `title-${options.id}`,
      `https://example.com/${options.id}`,
      `https://example.com/${options.id}`,
      `hash-${options.id}`,
      folderPath,
      options.status,
      options.ingestStage,
      options.briefSummaryStatus,
      options.detailedNotesStatus,
      options.classifyStatus,
      options.errorMessage ?? null,
      now,
      now,
    );

  return { id: options.id, folderPath };
}

function buildJob(
  overrides: Partial<JobEntity> & Pick<JobEntity, "jobType" | "materialId" | "retryCount" | "maxRetries">,
): JobEntity {
  return {
    id: overrides.id ?? "job_test_1",
    jobType: overrides.jobType,
    materialId: overrides.materialId,
    payloadJson: overrides.payloadJson ?? "{}",
    status: overrides.status ?? "running",
    retryCount: overrides.retryCount,
    maxRetries: overrides.maxRetries,
    nextRunAt: overrides.nextRunAt ?? null,
    lastError: overrides.lastError ?? null,
    createdAt: overrides.createdAt ?? "2026-02-27T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-02-27T10:00:00.000Z",
  };
}

test("任务失败且仍可重试时，阶段应回写 queued 且资料保持 processing_ai", () => {
  const ctx = setupTestContext();
  try {
    const material = seedMaterial(ctx, {
      id: "mat_retryable",
      status: "processing_ai",
      ingestStage: "completed",
      briefSummaryStatus: "running",
      detailedNotesStatus: "queued",
      classifyStatus: "queued",
      errorMessage: null,
    });

    ctx.aiTaskService.markJobFailure(
      buildJob({
        jobType: "generate_brief_summary",
        materialId: material.id,
        retryCount: 0,
        maxRetries: 3,
      }),
      new Error("LLM 超时"),
    );

    const detail = ctx.materialService.getDetail(material.id);
    assert.ok(detail);
    assert.equal(detail.briefSummaryStatus, "queued");
    assert.equal(detail.status, "processing_ai");
    assert.equal(detail.errorMessage, "LLM 超时");

    const logPath = path.join(material.folderPath, "logs", "ai_jobs.log");
    assert.equal(fs.existsSync(logPath), true);
    const logContent = fs.readFileSync(logPath, "utf-8");
    assert.match(logContent, /LLM 超时/);
  } finally {
    ctx.cleanup();
  }
});

test("任务超过重试上限后，最终应收敛为资料 failed", () => {
  const ctx = setupTestContext();
  try {
    const material = seedMaterial(ctx, {
      id: "mat_failed",
      status: "processing_ai",
      ingestStage: "completed",
      briefSummaryStatus: "running",
      detailedNotesStatus: "done",
      classifyStatus: "done",
      errorMessage: null,
    });

    ctx.aiTaskService.markJobFailure(
      buildJob({
        jobType: "generate_brief_summary",
        materialId: material.id,
        retryCount: 3,
        maxRetries: 3,
      }),
      new Error("LLM 服务不可用"),
    );
    ctx.aiTaskService.finalizeMaterialStatus(material.id);

    const detail = ctx.materialService.getDetail(material.id);
    assert.ok(detail);
    assert.equal(detail.briefSummaryStatus, "failed");
    assert.equal(detail.status, "failed");
    assert.equal(detail.errorMessage, "LLM 服务不可用");
  } finally {
    ctx.cleanup();
  }
});

test("所有 AI 阶段完成后，资料状态应收敛为 ready 并清空错误", () => {
  const ctx = setupTestContext();
  try {
    const material = seedMaterial(ctx, {
      id: "mat_all_done",
      status: "processing_ai",
      ingestStage: "completed",
      briefSummaryStatus: "done",
      detailedNotesStatus: "done",
      classifyStatus: "done",
      errorMessage: "旧错误",
    });

    ctx.aiTaskService.finalizeMaterialStatus(material.id);

    const detail = ctx.materialService.getDetail(material.id);
    assert.ok(detail);
    assert.equal(detail.status, "ready");
    assert.equal(detail.ingestStage, "completed");
    assert.equal(detail.errorMessage, undefined);
  } finally {
    ctx.cleanup();
  }
});

test("导入恢复遇到 staging 目录时，应迁移并重建 AI 任务", () => {
  const ctx = setupTestContext();
  try {
    const materialId = "mat_recover_staging";
    const finalPath = path.join(ctx.knowledgeRoot, "materials", "2026", "02", materialId);
    const stagingPath = path.join(ctx.knowledgeRoot, "materials", "_staging", materialId);
    fs.mkdirSync(path.join(stagingPath, "source"), { recursive: true });
    fs.mkdirSync(path.join(stagingPath, "ai"), { recursive: true });
    fs.mkdirSync(path.join(stagingPath, "chats"), { recursive: true });
    fs.mkdirSync(path.join(stagingPath, "logs"), { recursive: true });
    fs.writeFileSync(path.join(stagingPath, "source", "source.md"), "# staged source\n", "utf-8");

    seedMaterial(ctx, {
      id: materialId,
      folderPath: finalPath,
      status: "ingesting",
      ingestStage: "db_persisting",
      briefSummaryStatus: "pending",
      detailedNotesStatus: "pending",
      classifyStatus: "pending",
      errorMessage: null,
      createMaterialDirs: false,
      createSourceMd: false,
    });

    const result = ctx.materialService.recoverImportFailures({
      materialIds: [materialId],
      execute: true,
      cleanupOrphanStaging: false,
    });

    assert.equal(result.dryRun, false);
    assert.equal(result.summary.recovered, 1);
    assert.equal(result.items[0]?.action, "recover_from_staging");
    assert.equal(result.items[0]?.result, "recovered");
    assert.equal(fs.existsSync(path.join(finalPath, "source", "source.md")), true);
    assert.equal(fs.existsSync(stagingPath), false);

    const detail = ctx.materialService.getDetail(materialId);
    assert.ok(detail);
    assert.equal(detail.status, "processing_ai");
    assert.equal(detail.ingestStage, "completed");
    assert.equal(detail.briefSummaryStatus, "queued");
    assert.equal(detail.detailedNotesStatus, "queued");
    assert.equal(detail.classifyStatus, "queued");

    const queuedJobs = ctx.jobService.list("queued").filter((job) => job.materialId === materialId);
    assert.equal(queuedJobs.length, 3);
  } finally {
    ctx.cleanup();
  }
});

test("导入恢复未找到可恢复目录时，应回写失败终态", () => {
  const ctx = setupTestContext();
  try {
    const materialId = "mat_recover_missing";
    const finalPath = path.join(ctx.knowledgeRoot, "materials", "2026", "02", materialId);
    seedMaterial(ctx, {
      id: materialId,
      folderPath: finalPath,
      status: "ingesting",
      ingestStage: "db_persisting",
      briefSummaryStatus: "pending",
      detailedNotesStatus: "pending",
      classifyStatus: "pending",
      errorMessage: null,
      createMaterialDirs: false,
      createSourceMd: false,
    });

    const result = ctx.materialService.recoverImportFailures({
      materialIds: [materialId],
      execute: true,
      cleanupOrphanStaging: false,
    });

    assert.equal(result.summary.markedFailed, 1);
    assert.equal(result.items[0]?.action, "mark_failed");
    assert.equal(result.items[0]?.result, "marked_failed");

    const detail = ctx.materialService.getDetail(materialId);
    assert.ok(detail);
    assert.equal(detail.status, "failed");
    assert.equal(detail.ingestStage, "failed");
    assert.match(detail.errorMessage ?? "", /未找到可用目录/);
  } finally {
    ctx.cleanup();
  }
});
