CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  content_kind TEXT NOT NULL,
  original_url TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  content_hash TEXT,
  folder_path TEXT NOT NULL,
  status TEXT NOT NULL,
  ingest_stage TEXT NOT NULL,
  brief_summary_status TEXT NOT NULL,
  detailed_notes_status TEXT NOT NULL,
  classify_status TEXT NOT NULL,
  error_message TEXT,
  version_group_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_materials_canonical_url ON materials(canonical_url);
CREATE INDEX IF NOT EXISTS idx_materials_status ON materials(status);
CREATE INDEX IF NOT EXISTS idx_materials_updated_at ON materials(updated_at);

CREATE TABLE IF NOT EXISTS material_contents (
  material_id TEXT PRIMARY KEY,
  raw_html_path TEXT,
  markdown_path TEXT,
  plain_text_excerpt TEXT,
  word_count INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS material_ai_outputs (
  material_id TEXT PRIMARY KEY,
  brief_summary_path TEXT,
  detailed_notes_path TEXT,
  classification_suggestion_path TEXT,
  model_provider TEXT,
  model_name TEXT,
  generated_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS material_chunks (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL,
  level TEXT NOT NULL,
  section_title TEXT,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  token_estimate INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_material_chunks_material_level ON material_chunks(material_id, level);
CREATE INDEX IF NOT EXISTS idx_material_chunks_material_chunk_index ON material_chunks(material_id, chunk_index);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  name TEXT NOT NULL,
  path_cache TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_path_cache ON categories(path_cache);

CREATE TABLE IF NOT EXISTS material_category_links (
  material_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence REAL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(material_id, category_id, source)
);

CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_runs (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  status TEXT NOT NULL,
  current_stage TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_runs_thread_id ON chat_runs(thread_id);
CREATE INDEX IF NOT EXISTS idx_chat_runs_status ON chat_runs(status);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  run_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  citations_json TEXT,
  stage_trace_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_id_created_at ON chat_messages(thread_id, created_at);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  material_id TEXT,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  next_run_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_status_next_run_at ON jobs(status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_jobs_material_id ON jobs(material_id);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS material_search_fts (
  material_id TEXT PRIMARY KEY,
  title_tokens TEXT NOT NULL,
  brief_summary_tokens TEXT NOT NULL,
  detailed_notes_tokens TEXT NOT NULL,
  category_tokens TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_material_search_fts_material_id ON material_search_fts(material_id);
