import { stageLabel } from "./chatRunUtils";
export function selectRunStatus(state) {
    return state.status;
}
export function selectCanCancel(state) {
    return state.status === "starting" || state.status === "running";
}
export function selectCanRetry(state) {
    return state.status === "failed" || state.status === "cancelled" || state.status === "timeout";
}
export function selectOverallProgress(state) {
    return state.overallProgress;
}
export function selectStageTimeline(state) {
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
export function selectTraceTimeline(state) {
    const stageItems = state.traceSteps.map((step) => ({
        key: `stage-${step.stage}`,
        type: "stage_summary",
        title: stageLabel(step.stage),
        content: step.summary,
    }));
    const selectionItems = state.retrieval.selected.map((item, idx) => ({
        key: `selected-${item.materialId}-${idx}`,
        type: "selection_reason",
        title: `展开资料 ${item.materialId}`,
        content: item.reason,
        timestamp: item.timestamp,
    }));
    return [...stageItems, ...selectionItems];
}
export function selectCitations(state) {
    return state.citations;
}
export function selectAnswerText(state) {
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
export function selectAnswerMeta(state) {
    return {
        citationIds: state.answerCitations,
        error: state.error,
    };
}
export function selectRecoveryHint(state) {
    return state.recoveryHint;
}
