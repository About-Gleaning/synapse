import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { checkServerHealth, getThreadMessages, listThreads } from "../api/chatApi";
import { ChatAnswerPanel } from "../components/ChatAnswerPanel";
import { ChatAskInputPanel } from "../components/ChatAskInputPanel";
import { ChatCitationsPanel } from "../components/ChatCitationsPanel";
import { ChatProgressPanel } from "../components/ChatProgressPanel";
import { ChatRunStatusBadge } from "../components/ChatRunStatusBadge";
import { ChatTracePanel } from "../components/ChatTracePanel";
import { useChatStreamRun } from "../hooks/useChatStreamRun";
import { selectAnswerMeta, selectAnswerText, selectCanRetry, selectCitations, selectOverallProgress, selectRecoveryHint, selectRunStatus, selectStageTimeline, selectTraceTimeline, } from "../model/chatRunSelectors";
import { getCategoryTree } from "../../categories/api/categoryApi";
export function GlobalChatPageContainer(props) {
    const [question, setQuestion] = useState("");
    const [categoryIds, setCategoryIds] = useState([]);
    const [categoryOptions, setCategoryOptions] = useState([]);
    const [categoryLoading, setCategoryLoading] = useState(false);
    const [categoryError, setCategoryError] = useState("");
    const [threads, setThreads] = useState([]);
    const [selectedThreadId, setSelectedThreadId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [threadError, setThreadError] = useState("");
    const [messageError, setMessageError] = useState("");
    const [serverHealthError, setServerHealthError] = useState("");
    const [serverChecking, setServerChecking] = useState(false);
    const initializedSelectionRef = useRef(false);
    const runHealthCheck = async () => {
        setServerChecking(true);
        try {
            await checkServerHealth();
            setServerHealthError("");
            return true;
        }
        catch (error) {
            setServerHealthError(error instanceof Error ? error.message : "后端服务不可用");
            return false;
        }
        finally {
            setServerChecking(false);
        }
    };
    const loadThreads = async () => {
        try {
            setThreadError("");
            const data = await listThreads({
                scopeType: "global",
                scopeId: null,
                page: 1,
                pageSize: 50,
            });
            setThreads(data.items);
            return data.items;
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : "加载会话列表失败";
            setThreadError(msg);
            return [];
        }
    };
    const loadMessages = async (threadId) => {
        try {
            setMessageError("");
            const data = await getThreadMessages(threadId);
            setMessages(data);
        }
        catch (error) {
            setMessages([]);
            const msg = error instanceof Error ? error.message : "加载消息失败";
            setMessageError(msg);
        }
    };
    const loadCategoryOptions = async () => {
        setCategoryLoading(true);
        setCategoryError("");
        try {
            const tree = await getCategoryTree();
            setCategoryOptions(flattenCategoryNodes(tree.nodes));
        }
        catch (error) {
            setCategoryOptions([]);
            setCategoryError(error instanceof Error ? error.message : "分类加载失败");
        }
        finally {
            setCategoryLoading(false);
        }
    };
    const run = useChatStreamRun({
        mode: "global",
        onRunStarted: ({ threadId }) => {
            setSelectedThreadId(threadId);
            initializedSelectionRef.current = true;
        },
        onNeedRefreshMessages: async (threadId) => {
            await loadThreads();
            await loadMessages(threadId);
        },
    });
    useEffect(() => {
        setThreads([]);
        setMessages([]);
        setSelectedThreadId(null);
        setThreadError("");
        setMessageError("");
        initializedSelectionRef.current = false;
        void (async () => {
            await runHealthCheck();
            await loadCategoryOptions();
            const loaded = await loadThreads();
            if (!initializedSelectionRef.current && loaded.length > 0) {
                setSelectedThreadId(loaded[0].id);
                initializedSelectionRef.current = true;
            }
        })();
    }, []);
    useEffect(() => {
        if (!selectedThreadId) {
            setMessages([]);
            return;
        }
        run.resetRunView();
        void loadMessages(selectedThreadId);
    }, [selectedThreadId]);
    useEffect(() => {
        if (!props.focusRequest) {
            return;
        }
        setSelectedThreadId(props.focusRequest.threadId);
        initializedSelectionRef.current = true;
    }, [props.focusRequest?.token]);
    const status = selectRunStatus(run.runState);
    const recoveryHint = selectRecoveryHint(run.runState);
    const overallProgress = selectOverallProgress(run.runState);
    const stageTimeline = selectStageTimeline(run.runState);
    const traceTimeline = selectTraceTimeline(run.runState);
    const citations = selectCitations(run.runState);
    const answer = selectAnswerText(run.runState);
    const answerMeta = selectAnswerMeta(run.runState);
    const canRetry = selectCanRetry(run.runState);
    const canSubmit = useMemo(() => {
        return question.trim().length > 0 && !run.isRunning && !serverChecking && !serverHealthError;
    }, [question, run.isRunning, serverChecking, serverHealthError]);
    return (_jsxs("section", { id: props.sectionId, children: [_jsxs("section", { className: "panel", style: { marginBottom: 14 }, children: [_jsx("h3", { children: "\u5168\u5C40\u4F1A\u8BDD" }), _jsxs("div", { className: "toolbar", style: { marginBottom: 12 }, children: [_jsx(ChatRunStatusBadge, { status: status }), _jsxs("span", { className: "muted", children: ["Thread: ", selectedThreadId ?? "新会话"] }), _jsxs("span", { className: "muted", children: ["Run: ", run.lastRunId || "-"] })] }), recoveryHint ? _jsx("div", { className: "muted", children: recoveryHint }) : null, _jsxs("div", { className: "toolbar", children: [_jsxs("select", { value: selectedThreadId ?? "", onChange: (e) => {
                                    setSelectedThreadId(e.target.value || null);
                                    initializedSelectionRef.current = true;
                                }, children: [_jsx("option", { value: "", children: "\u65B0\u4F1A\u8BDD\uFF08\u4E0D\u52A0\u8F7D\u5386\u53F2\uFF09" }), threads.map((item) => (_jsxs("option", { value: item.id, children: [item.title, "\uFF08", item.messageCount, " \u6761\uFF09"] }, item.id)))] }), _jsx("button", { onClick: () => {
                                    setSelectedThreadId(null);
                                    setMessages([]);
                                    run.resetRunView();
                                    initializedSelectionRef.current = true;
                                }, children: "\u65B0\u5EFA\u4F1A\u8BDD" }), _jsx("button", { onClick: async () => {
                                    const loaded = await loadThreads();
                                    if (!selectedThreadId && loaded.length > 0 && !initializedSelectionRef.current) {
                                        setSelectedThreadId(loaded[0].id);
                                        initializedSelectionRef.current = true;
                                    }
                                }, children: "\u5237\u65B0\u4F1A\u8BDD" })] }), threadError ? _jsxs("div", { className: "muted", children: ["\u4F1A\u8BDD\u5217\u8868\u52A0\u8F7D\u5931\u8D25\uFF1A", threadError] }) : null] }), _jsxs("section", { className: "panel", style: { marginBottom: 14 }, children: [_jsx("h3", { children: "\u5386\u53F2\u6D88\u606F" }), selectedThreadId ? null : _jsx("div", { className: "muted", children: "\u5F53\u524D\u4E3A\u65B0\u4F1A\u8BDD\uFF0C\u53D1\u9001\u95EE\u9898\u540E\u81EA\u52A8\u521B\u5EFA\u7EBF\u7A0B" }), messageError ? _jsxs("div", { className: "muted", children: ["\u6D88\u606F\u52A0\u8F7D\u5931\u8D25\uFF1A", messageError] }) : null, messages.length === 0 ? _jsx("div", { className: "muted", children: "\u6682\u65E0\u5386\u53F2\u6D88\u606F" }) : null, messages.map((msg) => (_jsxs("article", { className: "trace-item", children: [_jsxs("div", { className: "toolbar", style: { marginBottom: 6 }, children: [_jsx("strong", { children: msg.role === "user" ? "我" : msg.role === "assistant" ? "助手" : msg.role }), _jsx("span", { className: "muted", children: msg.createdAt })] }), _jsx("div", { className: "answer-box", style: { minHeight: 0 }, children: msg.content })] }, msg.id)))] }), _jsx(ChatAskInputPanel, { question: question, isRunning: run.isRunning, canSubmit: canSubmit, canCancel: run.canCancel, selectedCategoryIds: categoryIds, categoryOptions: categoryOptions, categoryOptionsLoading: categoryLoading, categoryOptionsError: categoryError, serverHealthError: serverHealthError, onRetryHealthCheck: () => {
                    void runHealthCheck();
                }, onQuestionChange: setQuestion, onChangeCategoryIds: setCategoryIds, onSubmit: async () => {
                    const content = question.trim();
                    if (!content) {
                        return;
                    }
                    if (serverHealthError) {
                        const healthy = await runHealthCheck();
                        if (!healthy) {
                            return;
                        }
                    }
                    try {
                        await run.ask({
                            threadId: selectedThreadId ?? undefined,
                            question: content,
                            filters: {
                                categoryIds,
                            },
                            options: {
                                maxCandidateMaterials: 8,
                                maxExpandedMaterials: 3,
                                streamTrace: true,
                                timeoutMs: 120000,
                            },
                        });
                        setQuestion("");
                    }
                    catch (err) {
                        const message = err instanceof Error ? err.message : "提问失败";
                        if (message.includes("无法连接后端服务") || message.includes("流式提问失败")) {
                            setServerHealthError(message);
                        }
                        window.alert(message);
                    }
                }, onCancel: async () => {
                    await run.cancel();
                } }), _jsxs("div", { className: "chat-layout", children: [_jsx("div", { className: "chat-col", children: _jsx(ChatProgressPanel, { overallProgress: overallProgress, runStatus: status, stages: stageTimeline, startedAt: run.runState.startedAt, finishedAt: run.runState.finishedAt }) }), _jsxs("div", { className: "chat-col", children: [_jsx(ChatAnswerPanel, { text: answer.text, isStreaming: answer.isStreaming, isFinal: answer.isFinal, status: status, error: answerMeta.error, citationIds: answerMeta.citationIds, onRetry: canRetry
                                    ? async () => {
                                        const retryQuestion = run.runState.question.trim();
                                        if (!retryQuestion) {
                                            return;
                                        }
                                        try {
                                            await run.ask({
                                                threadId: selectedThreadId ?? undefined,
                                                question: retryQuestion,
                                                filters: { categoryIds },
                                            });
                                        }
                                        catch (err) {
                                            window.alert(err instanceof Error ? err.message : "提问失败");
                                        }
                                    }
                                    : undefined, onCopy: (text) => {
                                    void navigator.clipboard.writeText(text);
                                } }), _jsx(ChatTracePanel, { items: traceTimeline, isRunning: run.isRunning, hasFinalTrace: run.runState.traceSteps.some((x) => x.source === "trace.final") })] }), _jsx("div", { className: "chat-col", children: _jsx(ChatCitationsPanel, { citations: citations, candidates: run.runState.retrieval.candidates, isRunning: run.isRunning, onOpenMaterial: (payload) => {
                                props.onOpenMaterialCitation?.({
                                    materialId: payload.materialId,
                                    preferredContentKind: payload.level,
                                    highlightSnippet: payload.snippet,
                                });
                            } }) })] })] }));
}
function flattenCategoryNodes(nodes, depth = 0) {
    const result = [];
    for (const node of nodes) {
        result.push({
            id: node.id,
            path: node.path,
            depth,
        });
        result.push(...flattenCategoryNodes(node.children, depth + 1));
    }
    return result;
}
