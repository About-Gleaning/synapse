import type Database from "better-sqlite3";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nowIso } from "../utils/time";

const runtimeRequire = createRequire(import.meta.url);

export interface DbClient {
  conn: Database.Database;
  close: () => void;
}

export function createDb(dbPath: string): DbClient {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const conn = createConnection(dbPath);
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  runMigrations(conn);
  return {
    conn,
    close: () => conn.close(),
  };
}

function runMigrations(conn: Database.Database): void {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir =
    resolveFirstExistingDir([
      path.join(process.cwd(), "src", "db", "migrations"),
      path.join(process.cwd(), "dist", "db", "migrations"),
      path.join(runtimeDir, "migrations"),
    ]) ?? path.join(process.cwd(), "src", "db", "migrations");

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const version = file;
    const exists = conn
      .prepare("SELECT 1 as ok FROM schema_migrations WHERE version = ?")
      .get(version) as { ok: number } | undefined;
    if (exists) {
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    conn.exec(sql);
    conn
      .prepare("INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)")
      .run(version, nowIso());
  }
}

function resolveFirstExistingDir(paths: string[]): string | null {
  for (const dir of paths) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  return null;
}

function createConnection(dbPath: string): Database.Database {
  try {
    const BetterSqlite3 = runtimeRequire("better-sqlite3") as new (filename: string) => Database.Database;
    return new BetterSqlite3(dbPath);
  } catch (error) {
    console.warn(`[synapse] better-sqlite3 初始化失败，已回退 node:sqlite。原因: ${formatError(error)}`);
    return createNodeSqliteCompatConnection(dbPath);
  }
}

function createNodeSqliteCompatConnection(dbPath: string): Database.Database {
  type NodeSqliteStatement = {
    run: (...params: unknown[]) => unknown;
    get: (...params: unknown[]) => unknown;
    all: (...params: unknown[]) => unknown[];
  };
  type NodeSqliteDatabase = {
    prepare: (sql: string) => NodeSqliteStatement;
    exec: (sql: string) => void;
    close: () => void;
  };

  const { DatabaseSync } = runtimeRequire("node:sqlite") as {
    DatabaseSync: new (filename: string) => NodeSqliteDatabase;
  };
  const db = new DatabaseSync(dbPath);

  const conn = {
    prepare: (sql: string) => {
      const stmt = db.prepare(sql);
      return {
        run: (...params: unknown[]) => stmt.run(...params),
        get: (...params: unknown[]) => stmt.get(...params),
        all: (...params: unknown[]) => stmt.all(...params),
      };
    },
    exec: (sql: string) => db.exec(sql),
    pragma: (pragmaSql: string) => {
      const normalized = normalizePragmaSql(pragmaSql);
      db.exec(normalized);
      return [];
    },
    transaction: <T extends (...args: unknown[]) => unknown>(fn: T): T => {
      return ((...args: unknown[]) => {
        db.exec("BEGIN");
        try {
          const result = fn(...args);
          db.exec("COMMIT");
          return result;
        } catch (error) {
          try {
            db.exec("ROLLBACK");
          } catch {
            // 忽略回滚异常，保留原始错误栈
          }
          throw error;
        }
      }) as T;
    },
    close: () => db.close(),
  };

  return conn as unknown as Database.Database;
}

function normalizePragmaSql(pragmaSql: string): string {
  const trimmed = pragmaSql.trim().replace(/;$/, "");
  if (/^pragma\s+/i.test(trimmed)) {
    return trimmed;
  }
  return `PRAGMA ${trimmed}`;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
