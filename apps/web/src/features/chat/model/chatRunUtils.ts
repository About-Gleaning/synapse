import type {
  ChatStage,
  ChatStreamEventType,
  RetrievalCandidateItem,
  StageProgressView,
  TraceFinalStep,
  TraceStepView,
} from "@synapse/shared";

const STAGE_WEIGHT: Record<ChatStage, number> = {
  prepare: 5,
  retrieve_brief: 20,
  select_candidates: 10,
  expand_detailed: 20,
  read_original: 15,
  synthesize_answer: 25,
  finalize: 5,
};

export function calcOverallProgress(
  stages: Record<ChatStage, StageProgressView>,
  order: ChatStage[],
): number {
  const total = order.reduce((sum, stage) => sum + STAGE_WEIGHT[stage], 0);
  if (total === 0) {
    return 0;
  }

  const completed = order.reduce((sum, stage) => {
    const item = stages[stage];
    const ratio =
      item.status === "completed" || item.status === "skipped"
        ? 1
        : Math.max(0, Math.min(1, item.progress / 100));
    return sum + ratio * STAGE_WEIGHT[stage];
  }, 0);

  return Math.round((completed / total) * 100);
}

export function dedupeCandidates(items: RetrievalCandidateItem[]): RetrievalCandidateItem[] {
  const map = new Map<string, RetrievalCandidateItem>();
  for (const item of items) {
    const existed = map.get(item.materialId);
    if (!existed || item.score > existed.score) {
      map.set(item.materialId, item);
    }
  }
  return [...map.values()].sort((a, b) => b.score - a.score);
}

export function upsertTraceFromStageUpdated(
  traces: TraceStepView[],
  event: Extract<ChatStreamEventType, { type: "stage.updated" }>,
): TraceStepView[] {
  const idx = traces.findIndex((x) => x.stage === event.payload.stage);
  const next = {
    stage: event.payload.stage,
    summary: event.payload.summary,
    source: "stage.updated" as const,
  };
  if (idx < 0) {
    return [...traces, next];
  }
  const cloned = [...traces];
  cloned[idx] = next;
  return cloned;
}

export function mergeTraceFinal(traces: TraceStepView[], steps: TraceFinalStep[]): TraceStepView[] {
  const next = [...traces];
  for (const step of steps) {
    const idx = next.findIndex((x) => x.stage === step.stage);
    const item: TraceStepView = {
      stage: step.stage,
      summary: step.summary,
      source: "trace.final",
    };
    if (idx >= 0) {
      next[idx] = item;
    } else {
      next.push(item);
    }
  }
  return next;
}

export function stageLabel(stage: ChatStage): string {
  const map: Record<ChatStage, string> = {
    prepare: "准备阶段",
    retrieve_brief: "检索精简总结",
    select_candidates: "筛选候选资料",
    expand_detailed: "展开详细整理",
    read_original: "补充阅读原文",
    synthesize_answer: "生成回答",
    finalize: "收尾保存",
  };
  return map[stage];
}
