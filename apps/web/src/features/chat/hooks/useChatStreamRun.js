import { useEffect, useReducer, useRef, useState } from "react";
import { cancelRun, createThread, getRun, streamChat } from "../api/chatApi";
import { chatRunViewReducer } from "../model/chatRunReducer";
import { createInitialChatRunViewState } from "../model/chatRunViewState";
import { selectCanCancel } from "../model/chatRunSelectors";
export function useChatStreamRun(options) {
    const [runState, dispatch] = useReducer(chatRunViewReducer, undefined, createInitialChatRunViewState);
    const [lastRunId, setLastRunId] = useState(null);
    const [currentThreadId, setCurrentThreadId] = useState(null);
    const abortRef = useRef(null);
    const runIdRef = useRef(null);
    useEffect(() => {
        return () => {
            abortRef.current?.abort();
        };
    }, []);
    const ask = async (req) => {
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
        const finalReq = {
            threadId,
            question: req.question,
            filters: req.filters,
            options: req.options,
        };
        let streamedRunId = null;
        let streamedThreadId = threadId;
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
                const recovered = await tryRecoverRunState(streamedRunId, streamedThreadId ?? threadId, dispatch, options, setLastRunId, setCurrentThreadId);
                if (!recovered) {
                    throw new Error("流式连接已中断，且运行状态恢复失败，请重试");
                }
            }
        }
        catch (error) {
            if (abortRef.current?.signal.aborted) {
                return;
            }
            const recovered = await tryRecoverRunState(streamedRunId ?? runIdRef.current, streamedThreadId ?? threadId, dispatch, options, setLastRunId, setCurrentThreadId);
            if (recovered) {
                return;
            }
            throw error;
        }
    };
    const cancel = async () => {
        if (!runState.runId) {
            return;
        }
        await cancelRun(runState.runId);
    };
    const resetRunView = () => {
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
async function tryRecoverRunState(runId, fallbackThreadId, dispatch, options, setLastRunId, setCurrentThreadId) {
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
    }
    catch {
        return false;
    }
}
function buildRecoveryHint(status) {
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
