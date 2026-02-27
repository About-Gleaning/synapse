import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import type {
  MaterialAiStageStatus,
  MaterialContentKind,
  MaterialContentVO,
  MaterialDetailVO,
  MaterialIngestStage,
  MaterialImportReq,
  MaterialImportRecoveryItemVO,
  MaterialImportRecoveryReq,
  MaterialImportRecoveryVO,
  MaterialImportVO,
  MaterialListItemVO,
  MaterialListQueryReq,
  MaterialListVO,
  MaterialStatus,
} from "@synapse/shared";
import { getInternalSettings } from "../core/settings";
import { genId } from "../utils/id";
import { nowIso, nowYmd } from "../utils/time";
import { contentHash, tokenizeForSearch } from "../utils/text";
import { toCanonicalUrl, validatePublicUrl } from "../utils/url";
import type { CategoryService } from "./category-service";
import type { JobService } from "./job-service";
import { resolveIngestor } from "./ingestors";

interface MaterialRow {
  id: string;
  title: string;
  source_type: string;
  content_kind: string;
  original_url: string;
  canonical_url: string;
  folder_path: string;
  status: MaterialStatus;
  ingest_stage: MaterialIngestStage;
  brief_summary_status: MaterialAiStageStatus;
  detailed_notes_status: MaterialAiStageStatus;
  classify_status: MaterialAiStageStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface MaterialContentRow {
  material_id: string;
  raw_html_path: string;
  markdown_path: string;
  plain_text_excerpt: string;
  word_count: number;
  content_hash: string;
  created_at: string;
  updated_at: string;
}

export interface MaterialImportResult extends MaterialImportVO {
  duplicateOf?: string;
}

export class MaterialService {
  constructor(
    private readonly conn: Database.Database,
    private readonly jobService: JobService,
    private readonly categoryService: CategoryService,
  ) {}

  async importMaterial(req: MaterialImportReq): Promise<MaterialImportResult> {
    const validated = await validatePublicUrl(req.sourceUrl);
    const canonicalUrl = toCanonicalUrl(validated);
    const ingestor = resolveIngestor({
      sourceUrl: validated.toString(),
      sourceTypeHint: req.sourceTypeHint ?? "auto",
    });
    const ingested = await ingestor.ingest({
      sourceUrl: validated.toString(),
      sourceTypeHint: req.sourceTypeHint ?? "auto",
    });
    const hash = contentHash(ingested.plainTextContent);

    if (!req.options?.forceNewVersion) {
      const existed = this.conn
        .prepare("SELECT id, status FROM materials WHERE canonical_url = ? AND content_hash = ? LIMIT 1")
        .get(canonicalUrl, hash) as { id: string; status: MaterialStatus } | undefined;
      if (existed) {
        return {
          materialId: existed.id,
          status: parseMaterialStatus(existed.status),
          jobIds: [],
          duplicateOf: existed.id,
        };
      }
    }

    const settings = getInternalSettings(this.conn);
    const root = settings.knowledgeRoot;
    const materialId = genId("mat");
    const { year, month, day } = nowYmd();
    const slug = buildSlug(ingested.title);
    const folderName = `mat_${year}${month}${day}_${materialId.slice(-6)}_${slug}`;
    const stagingDir = path.join(root, "materials", "_staging", materialId);
    const finalDir = path.join(root, "materials", year, month, folderName);

    fs.mkdirSync(path.join(stagingDir, "source", "assets"), { recursive: true });
    fs.mkdirSync(path.join(stagingDir, "ai"), { recursive: true });
    fs.mkdirSync(path.join(stagingDir, "chats"), { recursive: true });
    fs.mkdirSync(path.join(stagingDir, "logs"), { recursive: true });

    fs.writeFileSync(path.join(stagingDir, "source", "original_url.txt"), validated.toString(), "utf-8");
    fs.writeFileSync(path.join(stagingDir, "source", "source.html"), ingested.htmlContent, "utf-8");
    fs.writeFileSync(path.join(stagingDir, "source", "source.md"), ingested.markdownContent, "utf-8");
    await this.downloadAssets(path.join(stagingDir, "source", "assets"), ingested.imageAssets);

    const now = nowIso();
    const meta = {
      schemaVersion: 1,
      materialId,
      title: ingested.title,
      sourceType: ingested.sourceType,
      contentKind: ingested.contentKind,
      originalUrl: validated.toString(),
      canonicalUrl,
      status: "ingesting",
      paths: {
        sourceHtml: "source/source.html",
        sourceMd: "source/source.md",
        briefSummary: "ai/brief_summary.md",
        detailedNotes: "ai/detailed_notes.md",
      },
      future: {
        audio: {
          transcriptPath: "source/audio_transcript.txt",
          audioFilePath: "source/audio.bin",
        },
        video: {
          linkPath: "source/video_link.txt",
        },
      },
      createdAt: now,
      updatedAt: now,
    };
    fs.writeFileSync(path.join(stagingDir, "meta.json"), JSON.stringify(meta, null, 2), "utf-8");

    const tx = this.conn.transaction(() => {
      this.conn
        .prepare(
          `INSERT INTO materials(
            id, title, source_type, content_kind, original_url, canonical_url, content_hash,
            folder_path, status, ingest_stage, brief_summary_status, detailed_notes_status, classify_status,
            created_at, updated_at
          ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'ingesting', 'db_persisting', 'pending', 'pending', 'pending', ?, ?)`,
        )
        .run(
          materialId,
          ingested.title,
          meta.sourceType,
          meta.contentKind,
          validated.toString(),
          canonicalUrl,
          hash,
          finalDir,
          now,
          now,
        );

      this.conn
        .prepare(
          `INSERT INTO material_contents(material_id, raw_html_path, markdown_path, plain_text_excerpt, word_count, content_hash, created_at, updated_at)
           VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          materialId,
          path.join(finalDir, "source", "source.html"),
          path.join(finalDir, "source", "source.md"),
          ingested.plainTextContent.slice(0, 3000),
          ingested.plainTextContent.length,
          hash,
          now,
          now,
        );

      this.conn
        .prepare(
          `INSERT INTO material_ai_outputs(material_id, brief_summary_path, detailed_notes_path, classification_suggestion_path, model_provider, model_name, generated_at, updated_at)
           VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          materialId,
          path.join(finalDir, "ai", "brief_summary.md"),
          path.join(finalDir, "ai", "detailed_notes.md"),
          path.join(finalDir, "ai", "classification_suggestion.json"),
          "openai-compatible",
          "gpt-4o-mini",
          null,
          now,
        );
    });

    tx();

    try {
      fs.mkdirSync(path.dirname(finalDir), { recursive: true });
      fs.renameSync(stagingDir, finalDir);

      this.conn
        .prepare("UPDATE materials SET status='ready', ingest_stage='completed', error_message=NULL, updated_at=? WHERE id=?")
        .run(nowIso(), materialId);

      const finalMeta = {
        ...meta,
        status: "ready",
        updatedAt: nowIso(),
      };
      fs.writeFileSync(path.join(finalDir, "meta.json"), JSON.stringify(finalMeta, null, 2), "utf-8");

      if (req.targetCategoryIds && req.targetCategoryIds.length > 0) {
        this.categoryService.bindMaterial(materialId, {
          categoryIds: req.targetCategoryIds,
          source: "manual",
        });
      }

      this.upsertSearchIndex(materialId);

      const jobIds = this.enqueueAiJobs(materialId);
      this.conn
        .prepare(
          `UPDATE materials
           SET status='processing_ai', brief_summary_status='queued', detailed_notes_status='queued', classify_status='queued', error_message=NULL, updated_at=?
           WHERE id=?`,
        )
        .run(nowIso(), materialId);

      return {
        materialId,
        status: "processing_ai",
        jobIds,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "导入流程失败";
      this.conn
        .prepare("UPDATE materials SET status='failed', ingest_stage='failed', error_message=?, updated_at=? WHERE id=?")
        .run(message, nowIso(), materialId);
      throw error;
    }
  }

  list(req: MaterialListQueryReq): MaterialListVO {
    const page = Math.max(1, req.page ?? 1);
    const pageSize = Math.max(1, Math.min(req.pageSize ?? 20, 100));
    const offset = (page - 1) * pageSize;
    const whereParts: string[] = [];
    const params: unknown[] = [];

    if (req.keyword) {
      whereParts.push("(m.title LIKE ? OR mc.plain_text_excerpt LIKE ?)");
      params.push(`%${req.keyword}%`, `%${req.keyword}%`);
    }

    if (req.status && req.status.length > 0) {
      whereParts.push(`m.status IN (${req.status.map(() => "?").join(",")})`);
      params.push(...req.status);
    }

    if (req.categoryId) {
      whereParts.push("EXISTS (SELECT 1 FROM material_category_links l WHERE l.material_id = m.id AND l.category_id = ?)");
      params.push(req.categoryId);
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";
    const orderBy = req.sortBy === "createdAt" ? "m.created_at" : "m.updated_at";
    const sortOrder = req.sortOrder === "asc" ? "ASC" : "DESC";

    const totalRow = this.conn
      .prepare(
        `SELECT COUNT(1) AS total
         FROM materials m
         LEFT JOIN material_contents mc ON mc.material_id = m.id
         ${whereSql}`,
      )
      .get(...params) as { total: number };

    const rows = this.conn
      .prepare(
        `SELECT m.*
         FROM materials m
         LEFT JOIN material_contents mc ON mc.material_id = m.id
         ${whereSql}
         ORDER BY ${orderBy} ${sortOrder}
         LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset) as MaterialRow[];

    const items: MaterialListItemVO[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      sourceType: row.source_type,
      contentKind: row.content_kind,
      originalUrl: row.original_url,
      status: row.status,
      briefSummaryStatus: row.brief_summary_status,
      detailedNotesStatus: row.detailed_notes_status,
      errorMessage: row.error_message ?? undefined,
      categoryPaths: this.categoryService.getCategoryPathsByMaterial(row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return {
      total: totalRow.total,
      page,
      pageSize,
      items,
    };
  }

  getDetail(id: string): MaterialDetailVO | null {
    const row = this.conn.prepare("SELECT * FROM materials WHERE id = ?").get(id) as MaterialRow | undefined;
    if (!row) {
      return null;
    }

    const categories = this.conn
      .prepare(
        `SELECT DISTINCT c.id, c.name, c.path_cache
         FROM material_category_links l
         INNER JOIN categories c ON c.id = l.category_id
         WHERE l.material_id = ?`,
      )
      .all(id) as Array<{ id: string; name: string; path_cache: string }>;

    return {
      id: row.id,
      title: row.title,
      sourceType: row.source_type,
      contentKind: row.content_kind,
      originalUrl: row.original_url,
      canonicalUrl: row.canonical_url,
      folderPath: row.folder_path,
      status: row.status,
      ingestStage: row.ingest_stage,
      briefSummaryStatus: row.brief_summary_status,
      detailedNotesStatus: row.detailed_notes_status,
      classifyStatus: row.classify_status,
      errorMessage: row.error_message ?? undefined,
      categories: categories.map((x) => ({ id: x.id, name: x.name, path: x.path_cache })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getContent(materialId: string, kind: MaterialContentKind): MaterialContentVO | null {
    const detail = this.getDetail(materialId);
    if (!detail) {
      return null;
    }

    let filepath = "";
    let title = detail.title;
    if (kind === "original") {
      filepath = path.join(detail.folderPath, "source", "source.md");
      title = `${detail.title}（原文）`;
    } else if (kind === "brief_summary") {
      filepath = path.join(detail.folderPath, "ai", "brief_summary.md");
      title = `${detail.title}（精简总结）`;
    } else if (kind === "detailed_notes") {
      filepath = path.join(detail.folderPath, "ai", "detailed_notes.md");
      title = `${detail.title}（详细整理）`;
    }

    const content = fs.existsSync(filepath) ? fs.readFileSync(filepath, "utf-8") : "";
    return {
      materialId,
      kind,
      title,
      content,
      contentFormat: "markdown",
      updatedAt: detail.updatedAt,
    };
  }

  rebuildAi(materialId: string): string[] {
    const detail = this.getDetail(materialId);
    if (!detail) {
      throw new Error("MATERIAL_NOT_FOUND");
    }
    const jobIds = this.enqueueAiJobs(materialId);
    this.conn
      .prepare(
        `UPDATE materials
         SET status='processing_ai', brief_summary_status='queued', detailed_notes_status='queued', classify_status='queued', error_message=NULL, updated_at=?
         WHERE id=?`,
      )
      .run(nowIso(), materialId);
    return jobIds;
  }

  recoverImportFailures(req: MaterialImportRecoveryReq = {}): MaterialImportRecoveryVO {
    const dryRun = req.execute !== true;
    const cleanupOrphanStaging = req.cleanupOrphanStaging !== false;
    const minAgeMinutes = Math.max(1, Math.min(req.stagingMinAgeMinutes ?? 30, 24 * 60));
    const minAgeMs = minAgeMinutes * 60 * 1000;
    const settings = getInternalSettings(this.conn);
    const stagingRoot = path.join(settings.knowledgeRoot, "materials", "_staging");
    const items: MaterialImportRecoveryItemVO[] = [];
    const summary = {
      recovered: 0,
      cleaned: 0,
      markedFailed: 0,
      planned: 0,
      skipped: 0,
      failed: 0,
    };

    const candidates = this.listImportRecoveryCandidates(req.materialIds);
    for (const material of candidates) {
      const stagingPath = path.join(stagingRoot, material.id);
      const finalPath = material.folder_path;
      const hasStaging = fs.existsSync(stagingPath);
      const hasFinal = fs.existsSync(finalPath);

      try {
        if (hasFinal) {
          if (dryRun) {
            addRecoveryItem(
              items,
              summary,
              {
                materialId: material.id,
                action: "resume_from_final",
                result: "planned",
                message: "检测到 final 目录，计划直接恢复 AI 任务",
                stagingPath: hasStaging ? stagingPath : undefined,
                finalPath,
              },
            );
            continue;
          }

          const jobIds = this.resumeRecoveredImport(material.id);
          addRecoveryItem(
            items,
            summary,
            {
              materialId: material.id,
              action: "resume_from_final",
              result: "recovered",
              message: `已从 final 目录恢复，重建 AI 任务 ${jobIds.length} 个`,
              stagingPath: hasStaging ? stagingPath : undefined,
              finalPath,
            },
          );
          continue;
        }

        if (hasStaging) {
          if (dryRun) {
            addRecoveryItem(
              items,
              summary,
              {
                materialId: material.id,
                action: "recover_from_staging",
                result: "planned",
                message: "检测到 staging 目录，计划迁移后恢复 AI 任务",
                stagingPath,
                finalPath,
              },
            );
            continue;
          }

          fs.mkdirSync(path.dirname(finalPath), { recursive: true });
          fs.renameSync(stagingPath, finalPath);
          const jobIds = this.resumeRecoveredImport(material.id);
          addRecoveryItem(
            items,
            summary,
            {
              materialId: material.id,
              action: "recover_from_staging",
              result: "recovered",
              message: `已迁移 staging -> final 并恢复，重建 AI 任务 ${jobIds.length} 个`,
              stagingPath,
              finalPath,
            },
          );
          continue;
        }

        if (material.status === "failed" && material.ingest_stage === "failed") {
          addRecoveryItem(
            items,
            summary,
            {
              materialId: material.id,
              action: "mark_failed",
              result: "skipped",
              message: "未找到 staging/final 目录，且资料已是失败终态，跳过",
              stagingPath,
              finalPath,
            },
          );
          continue;
        }

        if (dryRun) {
          addRecoveryItem(
            items,
            summary,
            {
              materialId: material.id,
              action: "mark_failed",
              result: "planned",
              message: "未找到 staging/final 目录，计划回写为失败终态",
              stagingPath,
              finalPath,
            },
          );
          continue;
        }

        this.updateAiStatus(material.id, {
          status: "failed",
          ingestStage: "failed",
          errorMessage: "恢复工具未找到可用目录，请重新导入原始链接",
        });
        addRecoveryItem(
          items,
          summary,
          {
            materialId: material.id,
            action: "mark_failed",
            result: "marked_failed",
            message: "未找到可恢复目录，已回写失败终态",
            stagingPath,
            finalPath,
          },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "恢复失败";
        this.updateAiStatus(material.id, {
          status: "failed",
          ingestStage: "failed",
          errorMessage: message,
        });
        addRecoveryItem(
          items,
          summary,
          {
            materialId: material.id,
            action: hasFinal ? "resume_from_final" : hasStaging ? "recover_from_staging" : "mark_failed",
            result: "failed",
            message,
            stagingPath: hasStaging ? stagingPath : undefined,
            finalPath,
          },
        );
      }
    }

    if (cleanupOrphanStaging && fs.existsSync(stagingRoot)) {
      const dbMaterialIds = new Set(
        (this.conn.prepare("SELECT id FROM materials").all() as Array<{ id: string }>).map((x) => x.id),
      );
      const entries = fs.readdirSync(stagingRoot, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const stagingPath = path.join(stagingRoot, entry.name);
        if (dbMaterialIds.has(entry.name)) {
          continue;
        }

        const stat = fs.statSync(stagingPath);
        if (Date.now() - stat.mtimeMs < minAgeMs) {
          addRecoveryItem(
            items,
            summary,
            {
              materialId: entry.name,
              action: "cleanup_orphan_staging",
              result: "skipped",
              message: `staging 目录创建时间不足 ${minAgeMinutes} 分钟，跳过清理`,
              stagingPath,
            },
          );
          continue;
        }

        if (dryRun) {
          addRecoveryItem(
            items,
            summary,
            {
              materialId: entry.name,
              action: "cleanup_orphan_staging",
              result: "planned",
              message: "计划清理孤儿 staging 目录",
              stagingPath,
            },
          );
          continue;
        }

        fs.rmSync(stagingPath, { recursive: true, force: true });
        addRecoveryItem(
          items,
          summary,
          {
            materialId: entry.name,
            action: "cleanup_orphan_staging",
            result: "cleaned",
            message: "已清理孤儿 staging 目录",
            stagingPath,
          },
        );
      }
    }

    return {
      dryRun,
      summary,
      items,
    };
  }

  getMaterialFileInfo(materialId: string): {
    title: string;
    folderPath: string;
    sourceMdPath: string;
    briefPath: string;
    detailedPath: string;
    classifyPath: string;
  } {
    const detail = this.getDetail(materialId);
    if (!detail) {
      throw new Error("MATERIAL_NOT_FOUND");
    }
    return {
      title: detail.title,
      folderPath: detail.folderPath,
      sourceMdPath: path.join(detail.folderPath, "source", "source.md"),
      briefPath: path.join(detail.folderPath, "ai", "brief_summary.md"),
      detailedPath: path.join(detail.folderPath, "ai", "detailed_notes.md"),
      classifyPath: path.join(detail.folderPath, "ai", "classification_suggestion.json"),
    };
  }

  updateAiStatus(
    materialId: string,
    patch: {
      briefSummaryStatus?: MaterialAiStageStatus;
      detailedNotesStatus?: MaterialAiStageStatus;
      classifyStatus?: MaterialAiStageStatus;
      status?: MaterialStatus;
      ingestStage?: MaterialIngestStage;
      errorMessage?: string | null;
    },
  ): void {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.briefSummaryStatus) {
      sets.push("brief_summary_status = ?");
      params.push(patch.briefSummaryStatus);
    }
    if (patch.detailedNotesStatus) {
      sets.push("detailed_notes_status = ?");
      params.push(patch.detailedNotesStatus);
    }
    if (patch.classifyStatus) {
      sets.push("classify_status = ?");
      params.push(patch.classifyStatus);
    }
    if (patch.status) {
      sets.push("status = ?");
      params.push(patch.status);
    }
    if (patch.ingestStage) {
      sets.push("ingest_stage = ?");
      params.push(patch.ingestStage);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "errorMessage")) {
      sets.push("error_message = ?");
      params.push(patch.errorMessage ?? null);
    }
    sets.push("updated_at = ?");
    params.push(nowIso());
    params.push(materialId);

    this.conn.prepare(`UPDATE materials SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  }

  upsertSearchIndex(materialId: string): void {
    const detail = this.getDetail(materialId);
    if (!detail) {
      return;
    }
    const brief = this.getContent(materialId, "brief_summary")?.content ?? "";
    const detailed = this.getContent(materialId, "detailed_notes")?.content ?? "";
    const categories = this.categoryService.getCategoryPathsByMaterial(materialId).join(" ");

    const titleTokens = tokenizeForSearch(detail.title).join(" ");
    const briefTokens = tokenizeForSearch(brief).join(" ");
    const detailedTokens = tokenizeForSearch(detailed).join(" ");
    const categoryTokens = tokenizeForSearch(categories).join(" ");

    this.conn
      .prepare(
        `INSERT INTO material_search_fts(material_id, title_tokens, brief_summary_tokens, detailed_notes_tokens, category_tokens)
         VALUES(?, ?, ?, ?, ?)
         ON CONFLICT(material_id) DO UPDATE SET
          title_tokens = excluded.title_tokens,
          brief_summary_tokens = excluded.brief_summary_tokens,
          detailed_notes_tokens = excluded.detailed_notes_tokens,
          category_tokens = excluded.category_tokens`,
      )
      .run(materialId, titleTokens, briefTokens, detailedTokens, categoryTokens);
  }

  private enqueueAiJobs(materialId: string): string[] {
    const briefJob = this.jobService.enqueue("generate_brief_summary", materialId, { materialId });
    const detailedJob = this.jobService.enqueue("generate_detailed_notes", materialId, { materialId });
    const classifyJob = this.jobService.enqueue("classify_material", materialId, { materialId });
    return [briefJob, detailedJob, classifyJob];
  }

  private listImportRecoveryCandidates(materialIds?: string[]): Array<{
    id: string;
    folder_path: string;
    status: MaterialStatus;
    ingest_stage: MaterialIngestStage;
  }> {
    const whereParts = ["ingest_stage <> 'completed'"];
    const params: unknown[] = [];
    if (materialIds && materialIds.length > 0) {
      whereParts.push(`id IN (${materialIds.map(() => "?").join(",")})`);
      params.push(...materialIds);
    }

    return this.conn
      .prepare(
        `SELECT id, folder_path, status, ingest_stage
         FROM materials
         WHERE ${whereParts.join(" AND ")}
         ORDER BY updated_at DESC`,
      )
      .all(...params) as Array<{
      id: string;
      folder_path: string;
      status: MaterialStatus;
      ingest_stage: MaterialIngestStage;
    }>;
  }

  private resumeRecoveredImport(materialId: string): string[] {
    const info = this.getMaterialFileInfo(materialId);
    if (!fs.existsSync(info.sourceMdPath)) {
      throw new Error("导入恢复失败：缺少 source/source.md");
    }

    this.upsertSearchIndex(materialId);
    const jobIds = this.enqueueAiJobs(materialId);
    this.conn
      .prepare(
        `UPDATE materials
         SET status='processing_ai',
             ingest_stage='completed',
             brief_summary_status='queued',
             detailed_notes_status='queued',
             classify_status='queued',
             error_message=NULL,
             updated_at=?
         WHERE id=?`,
      )
      .run(nowIso(), materialId);
    return jobIds;
  }

  private async downloadAssets(
    assetDir: string,
    assets: Array<{ originalUrl: string; localFilename: string }>,
  ): Promise<void> {
    if (assets.length === 0) {
      return;
    }
    fs.mkdirSync(assetDir, { recursive: true });
    const seen = new Set<string>();
    for (const item of assets.slice(0, 40)) {
      const key = `${item.originalUrl}::${item.localFilename}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      try {
        await validatePublicUrl(item.originalUrl);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        try {
          const resp = await fetch(item.originalUrl, {
            method: "GET",
            headers: {
              "User-Agent": "SynapseBot/0.1",
            },
            signal: controller.signal,
          });
          if (!resp.ok) {
            continue;
          }
          const bytes = Buffer.from(await resp.arrayBuffer());
          fs.writeFileSync(path.join(assetDir, item.localFilename), bytes);
        } finally {
          clearTimeout(timeout);
        }
      } catch {
        // 图片下载失败不阻断导入流程
      }
    }
  }
}

function buildSlug(title: string): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (normalized || "untitled").slice(0, 50);
}

function addRecoveryItem(
  items: MaterialImportRecoveryItemVO[],
  summary: MaterialImportRecoveryVO["summary"],
  item: MaterialImportRecoveryItemVO,
): void {
  items.push(item);
  if (item.result === "recovered") {
    summary.recovered += 1;
  } else if (item.result === "cleaned") {
    summary.cleaned += 1;
  } else if (item.result === "marked_failed") {
    summary.markedFailed += 1;
  } else if (item.result === "planned") {
    summary.planned += 1;
  } else if (item.result === "failed") {
    summary.failed += 1;
  } else if (item.result === "skipped") {
    summary.skipped += 1;
  }
}

function parseMaterialStatus(value: string): MaterialStatus {
  if (value === "ingesting" || value === "processing_ai" || value === "ready" || value === "failed") {
    return value;
  }
  return "processing_ai";
}
