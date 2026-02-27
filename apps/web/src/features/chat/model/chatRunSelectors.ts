import type { ChatRunStatus, ChatRunViewState, ChatStage, StageStatus } from "@synapse/shared";
import { stageLabel } from "./chatRunUtils";

export function selectRunStatus(state: ChatRunViewState): ChatRunStatus {
  return state.status;
}

export function selectCanCancel(state: ChatRunViewState): boolean {
  return state.status === "starting" || state.status === "running";
}

export function selectCanRetry(state: ChatRunViewState): boolean {
  return state.status === "failed" || state.status === "cancelled" || state.status === "timeout";
}

export function selectOverallProgress(state: ChatRunViewState): number {
  return state.overallProgress;
}

export function selectStageTimeline(state: ChatRunViewState): Array<{
  stage: ChatStage;
  stageLabel: string;
  status: StageStatus;
  progress: number;
  summary?: string;
  updatedAt?: string;
}> {
  return state.stageOrder.map((stage) => {
    const item = state.stages[stage];
    return {
      stage,
      stageLabel: stageLabel(stage),
      status: item.status,
      progress: item.progress,
      summary: item.summary,
      updatedAt: item.updatedAt,
    };
  });
}

export function selectTraceTimeline(state: ChatRunViewState): Array<{
  key: string;
  type: "stage_summary" | "selection_reason";
  title: string;
  content: string;
  timestamp?: string;
}> {
  const stageItems = state.traceSteps.map((step) => ({
    key: `stage-${step.stage}`,
    type: "stage_summary" as const,
    title: stageLabel(step.stage),
    content: step.summary,
  }));

  const selectionItems = state.retrieval.selected.map((item, idx) => ({
    key: `selected-${item.materialId}-${idx}`,
    type: "selection_reason" as const,
    title: `展开资料 ${item.materialId}`,
    content: item.reason,
    timestamp: item.timestamp,
  }));

  return [...stageItems, ...selectionItems];
}

export function selectCitations(state: ChatRunViewState): ChatRunViewState["citations"] {
  return state.citations;
}

export function selectAnswerText(state: ChatRunViewState): {
  text: string;
  isStreaming: boolean;
  isFinal: boolean;
} {
  if (state.answerFinalText) {
    return {
      text: state.answerFinalText,
      isStreaming: false,
      isFinal: true,
    };
  }
  return {
    text: state.answerStreamingText,
    isStreaming: state.status === "running" || state.status === "starting",
    isFinal: false,
  };
}

export function selectAnswerMeta(state: ChatRunViewState): {
  citationIds: string[];
  error: ChatRunViewState["error"];
} {
  return {
    citationIds: state.answerCitations,
    error: state.error,
  };
}

export function selectRecoveryHint(state: ChatRunViewState): string | null {
  return state.recoveryHint;
}
