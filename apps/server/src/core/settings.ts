import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import type { SettingsUpdateReq, SettingsVO } from "@synapse/shared";
import { nowIso } from "../utils/time";

const SETTINGS_KEY = "settings";

export interface RetrievalSettings {
  briefTitleWeight: number;
  briefSummaryWeight: number;
  categoryWeight: number;
  detailedNeedsOriginalThreshold: number;
}

export interface InternalSettings {
  knowledgeRoot: string;
  llmProvider: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  retrieval: RetrievalSettings;
}

export function getSettings(conn: Database.Database): SettingsVO {
  const s = getInternalSettings(conn);
  return {
    knowledgeRoot: s.knowledgeRoot,
    llmProvider: {
      baseUrl: s.llmProvider.baseUrl,
      apiKeyMasked: maskApiKey(s.llmProvider.apiKey),
      model: s.llmProvider.model,
    },
    retrieval: {
      briefTitleWeight: s.retrieval.briefTitleWeight,
      briefSummaryWeight: s.retrieval.briefSummaryWeight,
      categoryWeight: s.retrieval.categoryWeight,
      detailedNeedsOriginalThreshold: s.retrieval.detailedNeedsOriginalThreshold,
    },
  };
}

export function getInternalSettings(conn: Database.Database): InternalSettings {
  const row = conn
    .prepare("SELECT value_json FROM app_settings WHERE key = ?")
    .get(SETTINGS_KEY) as { value_json: string } | undefined;

  const parsed = parseInternalSettings(row?.value_json);
  const normalized = normalizeInternalSettings(parsed);
  if (hasSettingsDrift(parsed, normalized)) {
    saveInternalSettings(conn, normalized);
  } else {
    fs.mkdirSync(normalized.knowledgeRoot, { recursive: true });
  }
  return normalized;
}

export function updateSettings(conn: Database.Database, req: SettingsUpdateReq): SettingsVO {
  const current = getInternalSettings(conn);
  const merged = normalizeInternalSettings({
    knowledgeRoot: req.knowledgeRoot ?? current.knowledgeRoot,
    llmProvider: {
      baseUrl: req.llmProvider?.baseUrl ?? current.llmProvider.baseUrl,
      apiKey: req.llmProvider?.apiKey ?? current.llmProvider.apiKey,
      model: req.llmProvider?.model ?? current.llmProvider.model,
    },
    retrieval: {
      briefTitleWeight: req.retrieval?.briefTitleWeight ?? current.retrieval.briefTitleWeight,
      briefSummaryWeight: req.retrieval?.briefSummaryWeight ?? current.retrieval.briefSummaryWeight,
      categoryWeight: req.retrieval?.categoryWeight ?? current.retrieval.categoryWeight,
      detailedNeedsOriginalThreshold:
        req.retrieval?.detailedNeedsOriginalThreshold ?? current.retrieval.detailedNeedsOriginalThreshold,
    },
  });
  saveInternalSettings(conn, merged);
  return getSettings(conn);
}

function saveInternalSettings(conn: Database.Database, settings: InternalSettings): void {
  fs.mkdirSync(settings.knowledgeRoot, { recursive: true });
  conn
    .prepare(
      `INSERT INTO app_settings(key, value_json, updated_at)
       VALUES(?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    )
    .run(SETTINGS_KEY, JSON.stringify(settings), nowIso());
}

function buildDefaultSettings(): InternalSettings {
  const knowledgeRoot = path.join(process.cwd(), ".synapse-data");
  return {
    knowledgeRoot,
    llmProvider: {
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      model: "gpt-4o-mini",
    },
    retrieval: {
      briefTitleWeight: 0.35,
      briefSummaryWeight: 0.45,
      categoryWeight: 0.2,
      detailedNeedsOriginalThreshold: 0.2,
    },
  };
}

function parseInternalSettings(valueJson?: string): Partial<InternalSettings> | null {
  if (!valueJson) {
    return null;
  }
  try {
    return JSON.parse(valueJson) as Partial<InternalSettings>;
  } catch {
    return null;
  }
}

function normalizeInternalSettings(raw: Partial<InternalSettings> | null): InternalSettings {
  const defaults = buildDefaultSettings();
  return {
    knowledgeRoot: (raw?.knowledgeRoot || defaults.knowledgeRoot).trim() || defaults.knowledgeRoot,
    llmProvider: {
      baseUrl: normalizeLlmBaseUrl(
        (raw?.llmProvider?.baseUrl || defaults.llmProvider.baseUrl).trim() || defaults.llmProvider.baseUrl,
      ),
      apiKey: raw?.llmProvider?.apiKey ?? defaults.llmProvider.apiKey,
      model: (raw?.llmProvider?.model || defaults.llmProvider.model).trim() || defaults.llmProvider.model,
    },
    retrieval: {
      briefTitleWeight: sanitizeProbability(raw?.retrieval?.briefTitleWeight, defaults.retrieval.briefTitleWeight),
      briefSummaryWeight: sanitizeProbability(raw?.retrieval?.briefSummaryWeight, defaults.retrieval.briefSummaryWeight),
      categoryWeight: sanitizeProbability(raw?.retrieval?.categoryWeight, defaults.retrieval.categoryWeight),
      detailedNeedsOriginalThreshold: sanitizeProbability(
        raw?.retrieval?.detailedNeedsOriginalThreshold,
        defaults.retrieval.detailedNeedsOriginalThreshold,
      ),
    },
  };
}

function hasSettingsDrift(raw: Partial<InternalSettings> | null, normalized: InternalSettings): boolean {
  if (!raw) {
    return true;
  }
  return (
    raw.knowledgeRoot !== normalized.knowledgeRoot ||
    raw.llmProvider?.baseUrl !== normalized.llmProvider.baseUrl ||
    raw.llmProvider?.apiKey !== normalized.llmProvider.apiKey ||
    raw.llmProvider?.model !== normalized.llmProvider.model ||
    raw.retrieval?.briefTitleWeight !== normalized.retrieval.briefTitleWeight ||
    raw.retrieval?.briefSummaryWeight !== normalized.retrieval.briefSummaryWeight ||
    raw.retrieval?.categoryWeight !== normalized.retrieval.categoryWeight ||
    raw.retrieval?.detailedNeedsOriginalThreshold !== normalized.retrieval.detailedNeedsOriginalThreshold
  );
}

function sanitizeProbability(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    return fallback;
  }
  return Number(value.toFixed(4));
}

function normalizeLlmBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed.slice(0, -"/chat/completions".length);
  }
  return trimmed;
}

function maskApiKey(key: string): string {
  if (!key) {
    return "";
  }
  if (key.length <= 8) {
    return "****";
  }
  return `${key.slice(0, 3)}****${key.slice(-4)}`;
}
