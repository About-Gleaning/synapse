import type { ChatRunVO, ChatRunViewState, ChatStreamEventType } from "@synapse/shared";
import { createInitialChatRunViewState } from "./chatRunViewState";
import {
  calcOverallProgress,
  dedupeCandidates,
  mergeTraceFinal,
  upsertTraceFromStageUpdated,
} from "./chatRunUtils";

export type ChatRunViewAction =
  | { type: "RESET_FOR_NEW_RUN" }
  | { type: "APPLY_EVENT"; event: ChatStreamEventType }
  | { type: "APPLY_RUN_RECOVERY"; run: ChatRunVO; message: string };

export function chatRunViewReducer(state: ChatRunViewState, action: ChatRunViewAction): ChatRunViewState {
  if (action.type === "RESET_FOR_NEW_RUN") {
    return createInitialChatRunViewState();
  }
  if (action.type === "APPLY_RUN_RECOVERY") {
    return applyRecoveredRun(state, action.run, action.message);
  }

  const event = action.event;

  switch (event.type) {
    case "session.started": {
      return {
        ...createInitialChatRunViewState(),
        runId: event.runId,
        threadId: event.threadId,
        status: "starting",
        question: event.payload.question,
        scopeType: event.payload.scopeType,
        scopeId: event.payload.scopeId,
        startedAt: event.timestamp,
        recoveryHint: null,
      };
    }
    case "stage.updated": {
      const nextStages = { ...state.stages };
      nextStages[event.payload.stage] = {
        ...nextStages[event.payload.stage],
        status: event.payload.status,
        progress: event.payload.progress,
        summary: event.payload.summary,
        updatedAt: event.timestamp,
      };

      return {
        ...state,
        status: "running",
        stages: nextStages,
        overallProgress: calcOverallProgress(nextStages, state.stageOrder),
        traceSteps: upsertTraceFromStageUpdated(state.traceSteps, event),
      };
    }
    case "retrieval.candidates": {
      return {
        ...state,
        retrieval: {
          ...state.retrieval,
          candidates: dedupeCandidates(event.payload.candidates),
        },
      };
    }
    case "retrieval.selected": {
      return {
        ...state,
        retrieval: {
          ...state.retrieval,
          selected: [
            ...state.retrieval.selected,
            {
              materialId: event.payload.materialId,
              level: event.payload.level,
              reason: event.payload.reason,
              timestamp: event.timestamp,
            },
          ],
        },
      };
    }
    case "citation.appended": {
      if (state.citationIdsSeen[event.payload.citationId]) {
        return state;
      }
      return {
        ...state,
        citations: [
          ...state.citations,
          {
            ...event.payload,
            firstSeenAt: event.timestamp,
          },
        ],
        citationIdsSeen: {
          ...state.citationIdsSeen,
          [event.payload.citationId]: true,
        },
      };
    }
    case "answer.delta": {
      return {
        ...state,
        status: "running",
        answerStreamingText: state.answerStreamingText + event.payload.delta,
      };
    }
    case "answer.final": {
      return {
        ...state,
        answerFinalText: event.payload.content,
        answerCitations: event.payload.citations,
      };
    }
    case "trace.final": {
      return {
        ...state,
        traceSteps: mergeTraceFinal(state.traceSteps, event.payload.steps),
      };
    }
    case "session.error": {
      return {
        ...state,
        status:
          event.payload.code === "CHAT_RUN_CANCELLED"
            ? "cancelled"
            : event.payload.code === "CHAT_RUN_TIMEOUT"
              ? "timeout"
              : "failed",
        error: {
          code: event.payload.code,
          message: event.payload.message,
        },
        recoveryHint: null,
      };
    }
    case "session.done": {
      return {
        ...state,
        status: event.payload.status,
        finishedAt: event.timestamp,
        recoveryHint: null,
      };
    }
    default:
      return state;
  }
}

function applyRecoveredRun(
  state: ChatRunViewState,
  run: ChatRunVO,
  message: string,
): ChatRunViewState {
  const nextStatus =
    run.status === "queued"
      ? "starting"
      : run.status === "running"
        ? "running"
        : run.status === "completed"
          ? "completed"
          : run.status === "cancelled"
            ? "cancelled"
            : run.status === "timeout"
              ? "timeout"
              : "failed";

  return {
    ...state,
    runId: run.id,
    threadId: run.threadId,
    status: nextStatus,
    startedAt: run.startedAt ?? state.startedAt,
    finishedAt: run.finishedAt ?? state.finishedAt,
    error:
      run.status === "failed" || run.status === "timeout" || run.status === "cancelled"
        ? {
            code: run.errorCode ?? "INTERNAL_ERROR",
            message: run.errorMessage ?? "运行异常结束",
          }
        : null,
    recoveryHint: message,
  };
}
