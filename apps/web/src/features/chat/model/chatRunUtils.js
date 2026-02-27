const STAGE_WEIGHT = {
    prepare: 5,
    retrieve_brief: 20,
    select_candidates: 10,
    expand_detailed: 20,
    read_original: 15,
    synthesize_answer: 25,
    finalize: 5,
};
export function calcOverallProgress(stages, order) {
    const total = order.reduce((sum, stage) => sum + STAGE_WEIGHT[stage], 0);
    if (total === 0) {
        return 0;
    }
    const completed = order.reduce((sum, stage) => {
        const item = stages[stage];
        const ratio = item.status === "completed" || item.status === "skipped"
            ? 1
            : Math.max(0, Math.min(1, item.progress / 100));
        return sum + ratio * STAGE_WEIGHT[stage];
    }, 0);
    return Math.round((completed / total) * 100);
}
export function dedupeCandidates(items) {
    const map = new Map();
    for (const item of items) {
        const existed = map.get(item.materialId);
        if (!existed || item.score > existed.score) {
            map.set(item.materialId, item);
        }
    }
    return [...map.values()].sort((a, b) => b.score - a.score);
}
export function upsertTraceFromStageUpdated(traces, event) {
    const idx = traces.findIndex((x) => x.stage === event.payload.stage);
    const next = {
        stage: event.payload.stage,
        summary: event.payload.summary,
        source: "stage.updated",
    };
    if (idx < 0) {
        return [...traces, next];
    }
    const cloned = [...traces];
    cloned[idx] = next;
    return cloned;
}
export function mergeTraceFinal(traces, steps) {
    const next = [...traces];
    for (const step of steps) {
        const idx = next.findIndex((x) => x.stage === step.stage);
        const item = {
            stage: step.stage,
            summary: step.summary,
            source: "trace.final",
        };
        if (idx >= 0) {
            next[idx] = item;
        }
        else {
            next.push(item);
        }
    }
    return next;
}
export function stageLabel(stage) {
    const map = {
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
