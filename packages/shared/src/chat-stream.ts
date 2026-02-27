export type ChatRunStatus =
  | "idle"
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout";

export type ChatStage =
  | "prepare"
  | "retrieve_brief"
  | "select_candidates"
  | "expand_detailed"
  | "read_original"
  | "synthesize_answer"
  | "finalize";

export type StageStatus = "pending" | "running" | "completed" | "skipped" | "failed";

export interface ChatStreamEventBase {
  eventId: string;
  runId: string;
  threadId: string;
  timestamp: string;
}

export interface SessionStartedPayload {
  question: string;
  scopeType: "global" | "material";
  scopeId: string | null;
}

export interface StageUpdatedPayload {
  stage: ChatStage;
  status: StageStatus;
  progress: number;
  summary: string;
}

export interface RetrievalCandidateItem {
  materialId: string;
  title: string;
  score: number;
  matchedLevels: Array<"brief_summary" | "detailed_notes" | "original">;
  categoryPaths: string[];
}

export interface RetrievalCandidatesPayload {
  candidates: RetrievalCandidateItem[];
}

export interface RetrievalSelectedPayload {
  materialId: string;
  level: "brief_summary" | "detailed_notes" | "original";
  reason: string;
}

export interface CitationAnchor {
  sectionTitle?: string;
  chunkIndex?: number;
}

export interface CitationAppendedPayload {
  citationId: string;
  materialId: string;
  materialTitle: string;
  level: "brief_summary" | "detailed_notes" | "original";
  anchor?: CitationAnchor;
  snippet: string;
}

export interface AnswerDeltaPayload {
  delta: string;
}

export interface AnswerFinalPayload {
  content: string;
  citations: string[];
}

export interface TraceFinalStep {
  stage: ChatStage;
  summary: string;
}

export interface TraceFinalPayload {
  steps: TraceFinalStep[];
}

export interface SessionErrorPayload {
  code:
    | "CHAT_RUN_TIMEOUT"
    | "CHAT_RUN_CANCELLED"
    | "LLM_PROVIDER_ERROR"
    | "RETRIEVAL_FAILED"
    | "INTERNAL_ERROR";
  message: string;
}

export interface SessionDonePayload {
  status: "completed" | "failed" | "cancelled" | "timeout";
  durationMs: number;
}

export type SessionStartedEvent = ChatStreamEventBase & {
  type: "session.started";
  payload: SessionStartedPayload;
};

export type StageUpdatedEvent = ChatStreamEventBase & {
  type: "stage.updated";
  payload: StageUpdatedPayload;
};

export type RetrievalCandidatesEvent = ChatStreamEventBase & {
  type: "retrieval.candidates";
  payload: RetrievalCandidatesPayload;
};

export type RetrievalSelectedEvent = ChatStreamEventBase & {
  type: "retrieval.selected";
  payload: RetrievalSelectedPayload;
};

export type CitationAppendedEvent = ChatStreamEventBase & {
  type: "citation.appended";
  payload: CitationAppendedPayload;
};

export type AnswerDeltaEvent = ChatStreamEventBase & {
  type: "answer.delta";
  payload: AnswerDeltaPayload;
};

export type AnswerFinalEvent = ChatStreamEventBase & {
  type: "answer.final";
  payload: AnswerFinalPayload;
};

export type TraceFinalEvent = ChatStreamEventBase & {
  type: "trace.final";
  payload: TraceFinalPayload;
};

export type SessionErrorEvent = ChatStreamEventBase & {
  type: "session.error";
  payload: SessionErrorPayload;
};

export type SessionDoneEvent = ChatStreamEventBase & {
  type: "session.done";
  payload: SessionDonePayload;
};

export type ChatStreamEventType =
  | SessionStartedEvent
  | StageUpdatedEvent
  | RetrievalCandidatesEvent
  | RetrievalSelectedEvent
  | CitationAppendedEvent
  | AnswerDeltaEvent
  | AnswerFinalEvent
  | TraceFinalEvent
  | SessionErrorEvent
  | SessionDoneEvent;

export interface StageProgressView {
  stage: ChatStage;
  status: StageStatus;
  progress: number;
  summary?: string;
  updatedAt?: string;
}

export interface CitationView {
  citationId: string;
  materialId: string;
  materialTitle: string;
  level: "brief_summary" | "detailed_notes" | "original";
  anchor?: CitationAnchor;
  snippet: string;
  firstSeenAt: string;
}

export interface TraceStepView {
  stage: ChatStage;
  summary: string;
  source: "stage.updated" | "trace.final";
}

export interface ChatRunViewState {
  runId: string | null;
  threadId: string | null;
  status: ChatRunStatus;
  question: string;
  scopeType: "global" | "material" | null;
  scopeId: string | null;
  citations: CitationView[];
  citationIdsSeen: Record<string, true>;
  traceSteps: TraceStepView[];
  stages: Record<ChatStage, StageProgressView>;
  stageOrder: ChatStage[];
  overallProgress: number;
  answerStreamingText: string;
  answerFinalText: string | null;
  answerCitations: string[];
  retrieval: {
    candidates: RetrievalCandidateItem[];
    selected: Array<{
      materialId: string;
      level: "brief_summary" | "detailed_notes" | "original";
      reason: string;
      timestamp: string;
    }>;
  };
  error: {
    code: string;
    message: string;
  } | null;
  recoveryHint: string | null;
  startedAt?: string;
  finishedAt?: string;
}
