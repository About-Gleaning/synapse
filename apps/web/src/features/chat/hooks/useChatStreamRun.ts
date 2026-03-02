import { useEffect, useReducer, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ChatAskReq, ChatRunVO, ChatRunViewState } from "@synapse/shared";
import { cancelRun, createThread, getRun, streamChat } from "../api/chatApi";
import { chatRunViewReducer } from "../model/chatRunReducer";
import { createInitialChatRunViewState } from "../model/chatRunViewState";
import { selectCanCancel } from "../model/chatRunSelectors";

export interface UseChatStreamRunOptions {
  mode: "global" | "material";
  materialId?: string;
  onRunStarted?: (ctx: { runId: string; threadId: string }) => void;
  onRunFinished?: (ctx: { runId: string; threadId: string; status: string }) => void;
  onNeedRefreshMessages?: (threadId: string) => void;
}

export interface UseChatStreamRunResult {
  runState: ChatRunViewState;
  ask: (req: Omit<ChatAskReq, "threadId"> & { threadId?: string }) => Promise<void>;
  cancel: () => Promise<void>;
  resetRunView: () => void;
  isRunning: boolean;
  canCancel: boolean;
  lastRunId: string | null;
  currentThreadId: string | null;
}

export function useChatStreamRun(options: UseChatStreamRunOptions): UseChatStreamRunResult {
  const [runState, dispatch] = useReducer(chatRunViewReducer, undefined, createInitialChatRunViewState);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const ask = async (req: Omit<ChatAskReq, "threadId"> & { threadId?: string }): Promise<void> => {
    if (selectCanCancel(runState)) {
      await cancel();
    }

    dispatch({ type: "RESET_FOR_NEW_RUN" });

    let threadId = req.threadId ?? currentThreadId;
    if (!threadId) {
      const created = await createThread({
        scopeType: options.mode,
        scopeId: options.mode === "material" ? options.materialId ?? null : null,
        title: req.question.slice(0, 30),
      });
      threadId = created.id;
      setCurrentThreadId(threadId);
    }

    const finalReq: ChatAskReq = {
      threadId,
      question: req.question,
      scopeOverride: req.scopeOverride,
      filters: req.filters,
      options: req.options,
    };
    let streamedRunId: string | null = null;
    let streamedThreadId: string | null = threadId;
    let gotSessionDone = false;

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    runIdRef.current = null;

    const path = options.mode === "material" ? `/api/materials/${options.materialId}/chats/stream` : "/api/chats/stream";

    try {
      await streamChat({
        path,
        body: finalReq,
        signal: abortRef.current.signal,
        onEvent: (event) => {
          dispatch({ type: "APPLY_EVENT", event });
          if (event.type === "session.started") {
            streamedRunId = event.runId;
            streamedThreadId = event.threadId;
            runIdRef.current = event.runId;
            setLastRunId(event.runId);
            setCurrentThreadId(event.threadId);
            options.onRunStarted?.({ runId: event.runId, threadId: event.threadId });
          }
          if (event.type === "session.done") {
            gotSessionDone = true;
            options.onRunFinished?.({
              runId: event.runId,
              threadId: event.threadId,
              status: event.payload.status,
            });
            options.onNeedRefreshMessages?.(event.threadId);
          }
        },
      });
      if (!gotSessionDone) {
        const recovered = await tryRecoverRunState(
          streamedRunId,
          streamedThreadId ?? threadId,
          dispatch,
          options,
          setLastRunId,
          setCurrentThreadId,
        );
        if (!recovered) {
          throw new Error("流式连接已中断，且运行状态恢复失败，请重试");
        }
      }
    } catch (error) {
      if (abortRef.current?.signal.aborted) {
        return;
      }
      const recovered = await tryRecoverRunState(
        streamedRunId ?? runIdRef.current,
        streamedThreadId ?? threadId,
        dispatch,
        options,
        setLastRunId,
        setCurrentThreadId,
      );
      if (recovered) {
        return;
      }
      throw error;
    }
  };

  const cancel = async (): Promise<void> => {
    if (!runState.runId) {
      return;
    }
    await cancelRun(runState.runId);
  };

  const resetRunView = (): void => {
    dispatch({ type: "RESET_FOR_NEW_RUN" });
  };

  const canCancel = selectCanCancel(runState);

  return {
    runState,
    ask,
    cancel,
    resetRunView,
    isRunning: canCancel,
    canCancel,
    lastRunId,
    currentThreadId,
  };
}

async function tryRecoverRunState(
  runId: string | null,
  fallbackThreadId: string,
  dispatch: Dispatch<{ type: "APPLY_RUN_RECOVERY"; run: ChatRunVO; message: string }>,
  options: UseChatStreamRunOptions,
  setLastRunId: Dispatch<SetStateAction<string | null>>,
  setCurrentThreadId: Dispatch<SetStateAction<string | null>>,
): Promise<boolean> {
  if (!runId) {
    return false;
  }

  try {
    const run = await getRun(runId);
    setLastRunId(run.id);
    setCurrentThreadId(run.threadId);
    dispatch({
      type: "APPLY_RUN_RECOVERY",
      run,
      message: buildRecoveryHint(run.status),
    });

    if (run.status !== "queued" && run.status !== "running") {
      options.onRunFinished?.({
        runId: run.id,
        threadId: run.threadId,
        status: run.status,
      });
      options.onNeedRefreshMessages?.(run.threadId || fallbackThreadId);
    }
    return true;
  } catch {
    return false;
  }
}

function buildRecoveryHint(status: "queued" | "running" | "completed" | "failed" | "cancelled" | "timeout"): string {
  switch (status) {
    case "queued":
    case "running":
      return "连接已中断，已恢复运行状态。任务仍在后台执行，可稍后刷新会话查看结果。";
    case "completed":
      return "连接中断后已恢复：任务已完成，历史消息已自动刷新。";
    case "cancelled":
      return "连接中断后已恢复：任务已取消。";
    case "timeout":
      return "连接中断后已恢复：任务已超时。";
    default:
      return "连接中断后已恢复：任务失败，请重试。";
  }
}
