export interface ApiResp<T> {
  code: string;
  message: string;
  data: T;
}

export type MaterialStatus = "ingesting" | "processing_ai" | "ready" | "failed";
export type MaterialAiStageStatus = "pending" | "queued" | "running" | "done" | "failed";
export type MaterialIngestStage = "db_persisting" | "completed" | "failed";

export interface MaterialImportReq {
  sourceUrl: string;
  sourceTypeHint?: "auto" | "web_page" | "wechat_article" | "xiaohongshu_post";
  targetCategoryIds?: string[];
  options?: {
    forceNewVersion?: boolean;
  };
}

export interface MaterialImportVO {
  materialId: string;
  status: MaterialStatus;
  jobIds: string[];
}

export interface MaterialImportRecoveryReq {
  materialIds?: string[];
  execute?: boolean;
  cleanupOrphanStaging?: boolean;
  stagingMinAgeMinutes?: number;
}

export interface MaterialImportRecoveryItemVO {
  materialId?: string;
  action: "recover_from_staging" | "resume_from_final" | "mark_failed" | "cleanup_orphan_staging";
  result: "planned" | "recovered" | "cleaned" | "marked_failed" | "skipped" | "failed";
  message: string;
  stagingPath?: string;
  finalPath?: string;
}

export interface MaterialImportRecoveryVO {
  dryRun: boolean;
  summary: {
    recovered: number;
    cleaned: number;
    markedFailed: number;
    planned: number;
    skipped: number;
    failed: number;
  };
  items: MaterialImportRecoveryItemVO[];
}

export interface MaterialListQueryReq {
  keyword?: string;
  categoryId?: string;
  status?: MaterialStatus[];
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
}

export interface MaterialListItemVO {
  id: string;
  title: string;
  sourceType: string;
  contentKind: string;
  originalUrl: string;
  status: MaterialStatus;
  briefSummaryStatus: MaterialAiStageStatus;
  detailedNotesStatus: MaterialAiStageStatus;
  errorMessage?: string;
  categoryPaths: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MaterialListVO {
  total: number;
  page: number;
  pageSize: number;
  items: MaterialListItemVO[];
}

export interface MaterialDetailVO {
  id: string;
  title: string;
  sourceType: string;
  contentKind: string;
  originalUrl: string;
  canonicalUrl: string;
  folderPath: string;
  status: MaterialStatus;
  ingestStage: MaterialIngestStage;
  briefSummaryStatus: MaterialAiStageStatus;
  detailedNotesStatus: MaterialAiStageStatus;
  classifyStatus: MaterialAiStageStatus;
  errorMessage?: string;
  categories: Array<{
    id: string;
    name: string;
    path: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export type MaterialContentKind = "original" | "brief_summary" | "detailed_notes";

export interface MaterialContentVO {
  materialId: string;
  kind: MaterialContentKind;
  title: string;
  content: string;
  contentFormat: "markdown" | "html" | "text";
  updatedAt?: string;
}

export interface CategoryNodeVO {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  sortOrder: number;
  children: CategoryNodeVO[];
}

export interface CategoryTreeVO {
  nodes: CategoryNodeVO[];
}

export interface CategoryCreateReq {
  name: string;
  parentId?: string | null;
  sortOrder?: number;
}

export interface CategoryUpdateReq {
  name?: string;
  sortOrder?: number;
}

export interface CategoryMoveReq {
  newParentId: string | null;
  newSortOrder?: number;
}

export interface MaterialCategoryBindReq {
  categoryIds: string[];
  source?: "manual" | "ai_suggested";
}

export interface ChatAskReq {
  threadId: string;
  question: string;
  filters?: {
    categoryIds?: string[];
    materialIds?: string[];
  };
  options?: {
    maxCandidateMaterials?: number;
    maxExpandedMaterials?: number;
    streamTrace?: boolean;
    timeoutMs?: number;
  };
}

export interface ChatThreadCreateReq {
  scopeType: "global" | "material";
  scopeId: string | null;
  title: string;
}

export interface ChatThreadVO {
  id: string;
  scopeType: "global" | "material";
  scopeId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatThreadListQueryReq {
  scopeType?: "global" | "material";
  scopeId?: string | null;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface ChatThreadListItemVO {
  id: string;
  scopeType: "global" | "material";
  scopeId: string | null;
  scopeTitle: string | null;
  title: string;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatThreadListVO {
  total: number;
  page: number;
  pageSize: number;
  items: ChatThreadListItemVO[];
}

export interface ChatMessageVO {
  id: string;
  threadId: string;
  runId: string | null;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  citationsJson: string | null;
  stageTraceJson: string | null;
  createdAt: string;
}

export interface ChatRunVO {
  id: string;
  threadId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "timeout";
  currentStage: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobStatusVO {
  id: string;
  jobType: string;
  materialId?: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SettingsVO {
  knowledgeRoot: string;
  llmProvider: {
    baseUrl: string;
    apiKeyMasked: string;
    model: string;
  };
  retrieval: RetrievalSettingsVO;
}

export interface RetrievalSettingsVO {
  briefTitleWeight: number;
  briefSummaryWeight: number;
  categoryWeight: number;
  detailedNeedsOriginalThreshold: number;
}

export interface SettingsUpdateReq {
  knowledgeRoot?: string;
  llmProvider?: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  };
  retrieval?: Partial<RetrievalSettingsVO>;
}

export interface LlmMessageDTO {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmGenerateReq {
  model: string;
  systemPrompt?: string;
  messages: LlmMessageDTO[];
  temperature?: number;
  traceContext?: Record<string, string>;
  options?: {
    allowFallback?: boolean;
  };
}

export interface LlmGenerateResp {
  content: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  meta?: {
    provider: "remote" | "mock";
    fallbackReason?: string;
  };
}
