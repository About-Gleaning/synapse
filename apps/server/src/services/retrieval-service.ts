import type Database from "better-sqlite3";
import type { RetrievalCandidateItem } from "@synapse/shared";
import fs from "node:fs";
import { tokenizeForSearch } from "../utils/text";

export interface RetrievalScoringConfig {
  briefTitleWeight: number;
  briefSummaryWeight: number;
  categoryWeight: number;
  detailedNeedsOriginalThreshold: number;
}

export interface BriefCandidate {
  materialId: string;
  title: string;
  briefScore: number;
  briefSummary: string;
  categoryPaths: string[];
}

export interface DetailedCandidate extends BriefCandidate {
  detailedNotes: string;
  detailedScore: number;
  needsOriginal: boolean;
  originalDecision: string;
}

const DEFAULT_SCORING_CONFIG: RetrievalScoringConfig = {
  briefTitleWeight: 0.35,
  briefSummaryWeight: 0.45,
  categoryWeight: 0.2,
  detailedNeedsOriginalThreshold: 0.2,
};
const MIN_BRIEF_SCORE_FOR_ORIGINAL = 0.2;
const MAX_ORIGINAL_READ_WITH_STRONG_DETAILED = 1;
const MAX_ORIGINAL_READ_WITH_WEAK_DETAILED = 2;

export class RetrievalService {
  constructor(private readonly conn: Database.Database) {}

  searchByBrief(
    question: string,
    categoryIds: string[] = [],
    limit = 8,
    scoringConfig?: RetrievalScoringConfig,
  ): BriefCandidate[] {
    const weights = normalizeBriefWeights(scoringConfig);
    const tokens = tokenizeForSearch(question);
    if (tokens.length === 0) {
      return [];
    }
    const categoryFilter = new Set(categoryIds.filter(Boolean));
    const categoryFilterClause =
      categoryFilter.size > 0
        ? `AND EXISTS (
            SELECT 1 FROM material_category_links l
            WHERE l.material_id = m.id
              AND l.category_id IN (${Array.from(categoryFilter).map(() => "?").join(",")})
          )`
        : "";
    const rows = this.conn
      .prepare(
        `SELECT
          m.id,
          m.title,
          m.status,
          m.folder_path,
          IFNULL(ma.brief_summary_path, '') as brief_summary_path,
          IFNULL(idx.title_tokens, '') as title_tokens,
          IFNULL(idx.brief_summary_tokens, '') as brief_summary_tokens
        FROM materials m
        LEFT JOIN material_ai_outputs ma ON ma.material_id = m.id
        LEFT JOIN material_search_fts idx ON idx.material_id = m.id
        WHERE m.status IN ('ready', 'processing_ai')
          ${categoryFilterClause}
        ORDER BY m.updated_at DESC`,
      )
      .all(...Array.from(categoryFilter)) as Array<{
      id: string;
      title: string;
      folder_path: string;
      brief_summary_path: string;
      status: string;
      title_tokens: string;
      brief_summary_tokens: string;
    }>;
    if (rows.length === 0) {
      return [];
    }

    const categoryMap = this.buildCategoryMap(rows.map((row) => row.id));
    const scored = rows
      .map((row) => {
        const categories = categoryMap.get(row.id) ?? [];
        const fallbackBriefSummary = row.brief_summary_tokens ? "" : readFileSafe(row.brief_summary_path);
        const titleScore = scoreTokens(row.title_tokens || row.title, tokens);
        const briefScore = scoreTokens(
          row.brief_summary_tokens || tokenizeForSearch(fallbackBriefSummary).join(" "),
          tokens,
        );
        const categoryScore = scoreTokens(categories.map((x) => x.path).join(" "), tokens);
        const total =
          titleScore * weights.briefTitleWeight +
          briefScore * weights.briefSummaryWeight +
          categoryScore * weights.categoryWeight;

        if (total <= 0) {
          return null;
        }

        return {
          materialId: row.id,
          title: row.title,
          briefScore: total,
          briefSummaryPath: row.brief_summary_path,
          fallbackBriefSummary,
          categoryPaths: categories.map((x) => x.path),
        };
      })
      .filter(
        (
          x,
        ): x is {
          materialId: string;
          title: string;
          briefScore: number;
          briefSummaryPath: string;
          fallbackBriefSummary: string;
          categoryPaths: string[];
        } => Boolean(x),
      )
      .sort((a, b) => b.briefScore - a.briefScore)
      .slice(0, limit);

    return scored.map((item) => ({
      materialId: item.materialId,
      title: item.title,
      briefScore: item.briefScore,
      briefSummary: item.fallbackBriefSummary || readFileSafe(item.briefSummaryPath),
      categoryPaths: item.categoryPaths,
    }));
  }

  rerankByDetailed(
    question: string,
    candidates: BriefCandidate[],
    limit = 3,
    scoringConfig?: RetrievalScoringConfig,
  ): DetailedCandidate[] {
    if (candidates.length === 0) {
      return [];
    }
    const detailedNeedsOriginalThreshold = normalizeThreshold(
      scoringConfig?.detailedNeedsOriginalThreshold,
      DEFAULT_SCORING_CONFIG.detailedNeedsOriginalThreshold,
    );
    const tokens = tokenizeForSearch(question);
    if (tokens.length === 0) {
      return applyOriginalReadGating(
        candidates.slice(0, limit).map((item) => ({
          ...item,
          detailedNotes: "",
          detailedScore: 0,
          needsOriginal: false,
          originalDecision: "",
        })),
        detailedNeedsOriginalThreshold,
      );
    }
    const materialIds = candidates.map((item) => item.materialId);
    const folderMap = this.buildFolderPathMap(materialIds);
    const detailedTokenMap = this.buildDetailedTokenMap(materialIds);
    const enriched: DetailedCandidate[] = [];
    for (const item of candidates) {
      const folderPath = folderMap.get(item.materialId);
      if (!folderPath) {
        continue;
      }
      const tokenizedDetailed = detailedTokenMap.get(item.materialId) ?? "";
      let detailedNotes = "";
      let detailedScore = scoreTokens(tokenizedDetailed, tokens);
      if (!tokenizedDetailed) {
        detailedNotes = readFileSafe(`${folderPath}/ai/detailed_notes.md`);
        detailedScore = scoreTokens(detailedNotes, tokens);
      }
      enriched.push({
        ...item,
        detailedNotes,
        detailedScore,
        needsOriginal: false,
        originalDecision: "",
      });
    }

    const topCandidates = enriched
      .sort((a, b) => b.detailedScore - a.detailedScore)
      .slice(0, limit)
      .map((item) => {
        if (item.detailedNotes) {
          return item;
        }
        const folderPath = folderMap.get(item.materialId);
        if (!folderPath) {
          return item;
        }
        return {
          ...item,
          detailedNotes: readFileSafe(`${folderPath}/ai/detailed_notes.md`),
        };
      });

    return applyOriginalReadGating(topCandidates, detailedNeedsOriginalThreshold);
  }

  readOriginalByMaterial(materialId: string): string {
    const row = this.conn
      .prepare("SELECT folder_path FROM materials WHERE id = ?")
      .get(materialId) as { folder_path: string } | undefined;
    if (!row) {
      return "";
    }
    return readFileSafe(`${row.folder_path}/source/source.md`);
  }

  toEventCandidates(items: BriefCandidate[]): RetrievalCandidateItem[] {
    return items.map((item) => ({
      materialId: item.materialId,
      title: item.title,
      score: Number(item.briefScore.toFixed(4)),
      matchedLevels: ["brief_summary"],
      categoryPaths: item.categoryPaths,
    }));
  }

  private buildCategoryMap(materialIds: string[]): Map<string, Array<{ id: string; path: string }>> {
    if (materialIds.length === 0) {
      return new Map();
    }
    const placeholders = materialIds.map(() => "?").join(",");
    const rows = this.conn
      .prepare(
        `SELECT DISTINCT l.material_id, c.id, c.path_cache
         FROM material_category_links l
         INNER JOIN categories c ON c.id = l.category_id
         WHERE l.material_id IN (${placeholders})`,
      )
      .all(...materialIds) as Array<{ material_id: string; id: string; path_cache: string }>;

    const map = new Map<string, Array<{ id: string; path: string }>>();
    for (const row of rows) {
      const current = map.get(row.material_id) ?? [];
      current.push({ id: row.id, path: row.path_cache });
      map.set(row.material_id, current);
    }
    return map;
  }

  private buildFolderPathMap(materialIds: string[]): Map<string, string> {
    if (materialIds.length === 0) {
      return new Map();
    }
    const placeholders = materialIds.map(() => "?").join(",");
    const rows = this.conn
      .prepare(`SELECT id, folder_path FROM materials WHERE id IN (${placeholders})`)
      .all(...materialIds) as Array<{ id: string; folder_path: string }>;
    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.id, row.folder_path);
    }
    return map;
  }

  private buildDetailedTokenMap(materialIds: string[]): Map<string, string> {
    if (materialIds.length === 0) {
      return new Map();
    }
    const placeholders = materialIds.map(() => "?").join(",");
    const rows = this.conn
      .prepare(
        `SELECT material_id, detailed_notes_tokens
         FROM material_search_fts
         WHERE material_id IN (${placeholders})`,
      )
      .all(...materialIds) as Array<{ material_id: string; detailed_notes_tokens: string }>;
    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.material_id, row.detailed_notes_tokens ?? "");
    }
    return map;
  }
}

function scoreTokens(text: string, tokens: string[]): number {
  if (!text || tokens.length === 0) {
    return 0;
  }
  const lower = text.toLowerCase();
  let hit = 0;
  for (const t of tokens) {
    if (t && lower.includes(t)) {
      hit += 1;
    }
  }
  return hit / tokens.length;
}

function readFileSafe(filepath: string): string {
  if (!filepath) {
    return "";
  }
  try {
    return fs.readFileSync(filepath, "utf-8");
  } catch {
    return "";
  }
}

function normalizeBriefWeights(
  scoringConfig?: RetrievalScoringConfig,
): Pick<RetrievalScoringConfig, "briefTitleWeight" | "briefSummaryWeight" | "categoryWeight"> {
  const briefTitleWeight = normalizeWeight(scoringConfig?.briefTitleWeight, DEFAULT_SCORING_CONFIG.briefTitleWeight);
  const briefSummaryWeight = normalizeWeight(
    scoringConfig?.briefSummaryWeight,
    DEFAULT_SCORING_CONFIG.briefSummaryWeight,
  );
  const categoryWeight = normalizeWeight(scoringConfig?.categoryWeight, DEFAULT_SCORING_CONFIG.categoryWeight);
  const totalWeight = briefTitleWeight + briefSummaryWeight + categoryWeight;
  if (totalWeight <= 0) {
    return {
      briefTitleWeight: DEFAULT_SCORING_CONFIG.briefTitleWeight,
      briefSummaryWeight: DEFAULT_SCORING_CONFIG.briefSummaryWeight,
      categoryWeight: DEFAULT_SCORING_CONFIG.categoryWeight,
    };
  }

  return {
    briefTitleWeight: briefTitleWeight / totalWeight,
    briefSummaryWeight: briefSummaryWeight / totalWeight,
    categoryWeight: categoryWeight / totalWeight,
  };
}

function normalizeWeight(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return value;
}

function normalizeThreshold(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function applyOriginalReadGating(
  candidates: DetailedCandidate[],
  detailedNeedsOriginalThreshold: number,
): DetailedCandidate[] {
  if (candidates.length === 0) {
    return candidates;
  }

  const hasStrongDetailed = candidates.some((item) => item.detailedScore >= detailedNeedsOriginalThreshold);
  const maxOriginalReadCount = hasStrongDetailed
    ? MAX_ORIGINAL_READ_WITH_STRONG_DETAILED
    : Math.min(MAX_ORIGINAL_READ_WITH_WEAK_DETAILED, candidates.length);
  let originalQuota = maxOriginalReadCount;

  const decided = candidates.map((item) => {
    const hasDetailedNotes = item.detailedNotes.trim().length > 0;
    const belowThreshold = item.detailedScore < detailedNeedsOriginalThreshold;
    const belowBriefFloor = item.briefScore < MIN_BRIEF_SCORE_FOR_ORIGINAL;

    if (!belowThreshold && hasDetailedNotes) {
      return {
        ...item,
        needsOriginal: false,
        originalDecision: `详细整理命中阈值(${item.detailedScore.toFixed(3)}>=${detailedNeedsOriginalThreshold.toFixed(3)})，跳过原文`,
      } satisfies DetailedCandidate;
    }

    if (belowBriefFloor) {
      return {
        ...item,
        needsOriginal: false,
        originalDecision: `精简相关度过低(${item.briefScore.toFixed(3)}<${MIN_BRIEF_SCORE_FOR_ORIGINAL.toFixed(3)})，跳过原文`,
      } satisfies DetailedCandidate;
    }

    if (originalQuota <= 0) {
      return {
        ...item,
        needsOriginal: false,
        originalDecision: `原文配额已用尽(${maxOriginalReadCount})，跳过原文`,
      } satisfies DetailedCandidate;
    }

    originalQuota -= 1;
    const reason = !hasDetailedNotes
      ? "详细整理缺失，补充原文"
      : `详细整理低于阈值(${item.detailedScore.toFixed(3)}<${detailedNeedsOriginalThreshold.toFixed(3)})，补充原文`;

    return {
      ...item,
      needsOriginal: true,
      originalDecision: reason,
    } satisfies DetailedCandidate;
  });

  const hasAnyDetailedContext = decided.some((item) => item.detailedNotes.trim().length > 0);
  const hasAnyOriginalRead = decided.some((item) => item.needsOriginal);
  if (hasAnyDetailedContext || hasAnyOriginalRead) {
    return decided;
  }

  const first = decided[0];
  return [
    {
      ...first,
      needsOriginal: true,
      originalDecision: "详细整理不可用，触发兜底原文读取",
    },
    ...decided.slice(1),
  ];
}
