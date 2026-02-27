import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDb } from "../src/db/database";
import { JobService } from "../src/services/job-service";

interface TestContext {
  conn: ReturnType<typeof createDb>["conn"];
  jobService: JobService;
  cleanup: () => void;
}

function setupTestContext(): TestContext {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "synapse-job-recovery-test-"));
  const dbPath = path.join(workspace, "test.sqlite");
  const dbClient = createDb(dbPath);
  const jobService = new JobService(dbClient.conn);
  return {
    conn: dbClient.conn,
    jobService,
    cleanup: () => {
      dbClient.close();
      fs.rmSync(workspace, { recursive: true, force: true });
    },
  };
}

function setJobRunning(conn: TestContext["conn"], jobId: string, updatedAt: string): void {
  conn
    .prepare("UPDATE jobs SET status='running', next_run_at=NULL, last_error=NULL, updated_at=? WHERE id=?")
    .run(updatedAt, jobId);
}

function getJobRow(
  conn: TestContext["conn"],
  jobId: string,
): { status: string; last_error: string | null; next_run_at: string | null } {
  const row = conn
    .prepare("SELECT status, last_error, next_run_at FROM jobs WHERE id = ?")
    .get(jobId) as { status: string; last_error: string | null; next_run_at: string | null } | undefined;
  if (!row) {
    throw new Error(`JOB_NOT_FOUND:${jobId}`);
  }
  return row;
}

test("Worker 启动时应自动回收遗留 running 任务", () => {
  const ctx = setupTestContext();
  try {
    const oldNow = "2026-02-27T08:00:00.000Z";
    const jobId = ctx.jobService.enqueue("generate_detailed_notes", "mat_1", { materialId: "mat_1" });
    setJobRunning(ctx.conn, jobId, oldNow);

    ctx.jobService.startWorker({
      generate_brief_summary: async () => {},
      generate_detailed_notes: async () => {},
      classify_material: async () => {},
    });
    ctx.jobService.stopWorker();

    const row = getJobRow(ctx.conn, jobId);
    assert.equal(row.status, "queued");
    assert.ok((row.last_error ?? "").includes("自动回收"));
    assert.notEqual(row.next_run_at, null);
  } finally {
    ctx.cleanup();
  }
});

test("超时 running 任务应回收，未超时任务保持 running", () => {
  const ctx = setupTestContext();
  try {
    const now = Date.now();
    const timedOutAt = new Date(now - 11 * 60 * 1000).toISOString();
    const freshAt = new Date(now - 60 * 1000).toISOString();

    const timedOutJobId = ctx.jobService.enqueue("generate_detailed_notes", "mat_timeout", { materialId: "mat_timeout" });
    const freshJobId = ctx.jobService.enqueue("classify_material", "mat_fresh", { materialId: "mat_fresh" });
    setJobRunning(ctx.conn, timedOutJobId, timedOutAt);
    setJobRunning(ctx.conn, freshJobId, freshAt);

    (ctx.jobService as any).recoverTimedOutRunningJobs();

    const timedOutRow = getJobRow(ctx.conn, timedOutJobId);
    const freshRow = getJobRow(ctx.conn, freshJobId);

    assert.equal(timedOutRow.status, "queued");
    assert.ok((timedOutRow.last_error ?? "").includes("超时"));
    assert.equal(freshRow.status, "running");
    assert.equal(freshRow.last_error, null);
  } finally {
    ctx.cleanup();
  }
});
