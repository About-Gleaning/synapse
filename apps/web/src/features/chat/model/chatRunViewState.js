export function createInitialChatRunViewState() {
    const stageOrder = [
        "prepare",
        "retrieve_brief",
        "select_candidates",
        "expand_detailed",
        "read_original",
        "synthesize_answer",
        "finalize",
    ];
    const stages = Object.fromEntries(stageOrder.map((stage) => [
        stage,
        {
            stage,
            status: "pending",
            progress: 0,
        },
    ]));
    return {
        runId: null,
        threadId: null,
        status: "idle",
        question: "",
        scopeType: null,
        scopeId: null,
        citations: [],
        citationIdsSeen: {},
        traceSteps: [],
        stages,
        stageOrder,
        overallProgress: 0,
        answerStreamingText: "",
        answerFinalText: null,
        answerCitations: [],
        retrieval: {
            candidates: [],
            selected: [],
        },
        error: null,
        recoveryHint: null,
    };
}
