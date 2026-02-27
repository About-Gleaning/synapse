import type Database from "better-sqlite3";
import { genId } from "../utils/id";
import { nowIso } from "../utils/time";

export type JobType = "generate_brief_summary" | "generate_detailed_notes" | "classify_material";

export interface JobEntity {
  id: string;
  jobType: JobType;
  materialId: string | null;
  payloadJson: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  retryCount: number;
  maxRetries: number;
  nextRunAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface JobRow {
  id: string;
  job_type: JobType;
  material_id: string | null;
  payload_json: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  retry_count: number;
  max_retries: number;
  next_run_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export type JobHandler = (job: JobEntity) => Promise<void>;

const RUNNING_RECOVERY_REASON_STARTUP = "检测到上次异常退出遗留 running 任务，已自动回收";
const RUNNING_RECOVERY_REASON_TIMEOUT = "任务 running 超时，已自动回收重试";
const RUNNING_TIMEOUT_MS = 10 * 60 * 1000;

export class JobService {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(private readonly conn: Database.Database) {}

  enqueue(jobType: JobType, materialId: string | null, payload: Record<string, unknown>): string {
    const id = genId("job");
    const now = nowIso();
    this.conn
      .prepare(
        `INSERT INTO jobs(id, job_type, material_id, payload_json, status, retry_count, max_retries, next_run_at, created_at, updated_at)
         VALUES(?, ?, ?, ?, 'queued', 0, 3, ?, ?, ?)`,
      )
      .run(id, jobType, materialId, JSON.stringify(payload), now, now, now);
    return id;
  }

  list(statusCsv?: string): JobEntity[] {
    if (!statusCsv) {
      const rows = this.conn.prepare("SELECT * FROM jobs ORDER BY created_at DESC").all() as JobRow[];
      return rows.map(mapRow);
    }
    const statuses = statusCsv.split(",").map((x) => x.trim());
    const placeholders = statuses.map(() => "?").join(",");
    const rows = this.conn
      .prepare(`SELECT * FROM jobs WHERE status IN (${placeholders}) ORDER BY created_at DESC`)
      .all(...statuses) as JobRow[];
    return rows.map(mapRow);
  }

  get(id: string): JobEntity | null {
    const row = this.conn.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
    return row ? mapRow(row) : null;
  }

  retry(id: string): boolean {
    const now = nowIso();
    const result = this.conn
      .prepare(
        `UPDATE jobs SET status='queued', next_run_at=?, last_error=NULL, updated_at=?
         WHERE id = ? AND status IN ('failed', 'cancelled')`,
      )
      .run(now, now, id);
    return result.changes > 0;
  }

  cancel(id: string): boolean {
    const now = nowIso();
    const result = this.conn
      .prepare("UPDATE jobs SET status='cancelled', updated_at=? WHERE id = ? AND status IN ('queued', 'running')")
      .run(now, id);
    return result.changes > 0;
  }

  startWorker(handlers: Record<JobType, JobHandler>): void {
    if (this.timer) {
      return;
    }
    this.recoverRunningJobs(RUNNING_RECOVERY_REASON_STARTUP);
    this.timer = setInterval(() => {
      void this.tick(handlers);
    }, 1500);
  }

  stopWorker(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(handlers: Record<JobType, JobHandler>): Promise<void> {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;

    try {
      this.recoverTimedOutRunningJobs();
      const now = nowIso();
      const row = this.conn
        .prepare(
          `SELECT * FROM jobs
           WHERE status = 'queued'
             AND (next_run_at IS NULL OR next_run_at <= ?)
           ORDER BY created_at ASC
           LIMIT 1`,
        )
        .get(now) as JobRow | undefined;

      if (!row) {
        return;
      }
      const job = mapRow(row);

      this.conn
        .prepare("UPDATE jobs SET status='running', updated_at=? WHERE id=?")
        .run(nowIso(), job.id);

      const handler = handlers[job.jobType];
      if (!handler) {
        throw new Error(`未知任务类型: ${job.jobType}`);
      }

      try {
        await handler({ ...job, status: "running" });
        this.conn
          .prepare("UPDATE jobs SET status='succeeded', updated_at=? WHERE id=?")
          .run(nowIso(), job.id);
      } catch (error) {
        const retryCount = job.retryCount + 1;
        const maxRetries = job.maxRetries;
        const lastError = error instanceof Error ? error.message : "任务执行失败";

        if (retryCount <= maxRetries) {
          const nextRunAt = calcNextRunAt(retryCount);
          this.conn
            .prepare(
              `UPDATE jobs
               SET status='queued', retry_count=?, next_run_at=?, last_error=?, updated_at=?
               WHERE id=?`,
            )
            .run(retryCount, nextRunAt, lastError, nowIso(), job.id);
        } else {
          this.conn
            .prepare(
              `UPDATE jobs
               SET status='failed', retry_count=?, last_error=?, updated_at=?
               WHERE id=?`,
            )
            .run(retryCount, lastError, nowIso(), job.id);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private recoverTimedOutRunningJobs(): void {
    const threshold = new Date(Date.now() - RUNNING_TIMEOUT_MS).toISOString();
    this.recoverRunningJobs(RUNNING_RECOVERY_REASON_TIMEOUT, threshold);
  }

  private recoverRunningJobs(reason: string, updatedBefore?: string): void {
    const now = nowIso();
    if (updatedBefore) {
      this.conn
        .prepare(
          `UPDATE jobs
           SET status='queued', next_run_at=?, last_error=?, updated_at=?
           WHERE status='running' AND updated_at <= ?`,
        )
        .run(now, reason, now, updatedBefore);
      return;
    }

    this.conn
      .prepare(
        `UPDATE jobs
         SET status='queued', next_run_at=?, last_error=?, updated_at=?
         WHERE status='running'`,
      )
      .run(now, reason, now);
  }
}

function calcNextRunAt(retryCount: number): string {
  const sec = retryCount === 1 ? 30 : retryCount === 2 ? 120 : 300;
  return new Date(Date.now() + sec * 1000).toISOString();
}

function mapRow(row: JobRow): JobEntity {
  return {
    id: row.id,
    jobType: row.job_type,
    materialId: row.material_id,
    payloadJson: row.payload_json,
    status: row.status,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    nextRunAt: row.next_run_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
