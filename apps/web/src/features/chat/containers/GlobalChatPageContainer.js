import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { requestJson } from "../../../shared/api/httpClient";
import { checkServerHealth, getThreadMessages, listThreads } from "../api/chatApi";
import { MarkdownMessage } from "../components/MarkdownMessage";
import { UnifiedChatAskInputPanel } from "../components/UnifiedChatAskInputPanel";
import { useChatStreamRun } from "../hooks/useChatStreamRun";
import { selectAnswerMeta, selectAnswerText, selectCanRetry, selectCitations, selectRunStatus } from "../model/chatRunSelectors";
import { extractSelectedMentionTokens, validateQuestionMention } from "../model/mentionUtils";
export function GlobalChatPageContainer(props) {
    const [question, setQuestion] = useState("");
    const [mentionQuery, setMentionQuery] = useState("");
    const [selectedMention, setSelectedMention] = useState(null);
    const [mentionError, setMentionError] = useState("");
    const [optimisticQuestion, setOptimisticQuestion] = useState("");
    const [materials, setMaterials] = useState([]);
    const [materialsError, setMaterialsError] = useState("");
    const [threads, setThreads] = useState([]);
    const [selectedThreadId, setSelectedThreadId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [threadError, setThreadError] = useState("");
    const [messageError, setMessageError] = useState("");
    const [serverHealthError, setServerHealthError] = useState("");
    const [serverChecking, setServerChecking] = useState(false);
    const initializedSelectionRef = useRef(false);
    const messageScrollRef = useRef(null);
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
    const loadMaterials = async () => {
        try {
            setMaterialsError("");
            const data = await requestJson("/api/materials?page=1&pageSize=200", {
                method: "GET",
            });
            setMaterials(data.items);
        }
        catch (error) {
            setMaterials([]);
            setMaterialsError(error instanceof Error ? error.message : "资料列表加载失败");
        }
    };
    const loadThreads = async () => {
        try {
            setThreadError("");
            const data = await listThreads({
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
    const run = useChatStreamRun({
        mode: "global",
        onRunStarted: ({ threadId }) => {
            setSelectedThreadId(threadId);
            initializedSelectionRef.current = true;
        },
        onNeedRefreshMessages: async (threadId) => {
            await loadThreads();
            await loadMessages(threadId);
            setOptimisticQuestion("");
        },
    });
    const resetToNewThread = () => {
        setSelectedThreadId(null);
        setMessages([]);
        setOptimisticQuestion("");
        run.resetRunView();
        initializedSelectionRef.current = true;
    };
    useEffect(() => {
        setThreads([]);
        setMessages([]);
        setSelectedThreadId(null);
        setThreadError("");
        setMessageError("");
        initializedSelectionRef.current = false;
        void (async () => {
            await runHealthCheck();
            await loadMaterials();
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
            run.resetRunView();
            return;
        }
        run.resetRunView();
        setOptimisticQuestion("");
        void loadMessages(selectedThreadId);
    }, [selectedThreadId]);
    useEffect(() => {
        if (!props.focusRequest) {
            return;
        }
        const mentionTitle = normalizeMentionTitle(props.focusRequest.mentionMaterialTitle);
        if (props.focusRequest.mentionMaterialId && mentionTitle) {
            setSelectedMention({
                materialId: props.focusRequest.mentionMaterialId,
                title: mentionTitle,
            });
            setQuestion(`@{${mentionTitle}} `);
            setMentionQuery("");
            setMentionError("");
        }
        if (props.focusRequest.forceNewThread) {
            resetToNewThread();
            return;
        }
        setSelectedThreadId(props.focusRequest.threadId ?? null);
        initializedSelectionRef.current = true;
    }, [props.focusRequest?.token]);
    const mentionValidation = useMemo(() => {
        return validateQuestionMention(question, selectedMention?.title ?? null);
    }, [question, selectedMention?.title]);
    const mentionCandidates = useMemo(() => {
        const keyword = mentionQuery.trim().toLowerCase();
        const sorted = [...materials].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        if (!keyword) {
            return sorted.slice(0, 8).map((item) => ({
                materialId: item.id,
                title: item.title,
            }));
        }
        return sorted
            .filter((item) => item.title.toLowerCase().includes(keyword))
            .slice(0, 8)
            .map((item) => ({
            materialId: item.id,
            title: item.title,
        }));
    }, [materials, mentionQuery]);
    const status = selectRunStatus(run.runState);
    const answer = selectAnswerText(run.runState);
    const answerMeta = selectAnswerMeta(run.runState);
    const canRetry = selectCanRetry(run.runState);
    const liveCitations = selectCitations(run.runState);
    const canSubmit = useMemo(() => {
        return question.trim().length > 0 && mentionValidation.ok && !run.isRunning && !serverChecking && !serverHealthError;
    }, [question, mentionValidation.ok, run.isRunning, serverChecking, serverHealthError]);
    const selectedThread = useMemo(() => {
        if (!selectedThreadId) {
            return null;
        }
        return threads.find((item) => item.id === selectedThreadId) ?? null;
    }, [threads, selectedThreadId]);
    const latestAssistantMessage = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i -= 1) {
            const item = messages[i];
            if (item?.role === "assistant") {
                return normalizeForDedup(item.content);
            }
        }
        return "";
    }, [messages]);
    const currentLiveAnswer = useMemo(() => normalizeForDedup(answer.text), [answer.text]);
    const shouldHideDuplicatedLiveAnswer = useMemo(() => {
        if (run.runState.status !== "completed") {
            return false;
        }
        if (!currentLiveAnswer || !latestAssistantMessage) {
            return false;
        }
        return currentLiveAnswer === latestAssistantMessage;
    }, [run.runState.status, currentLiveAnswer, latestAssistantMessage]);
    useEffect(() => {
        const el = messageScrollRef.current;
        if (!el) {
            return;
        }
        el.scrollTo({
            top: el.scrollHeight,
            behavior: "smooth",
        });
    }, [messages, optimisticQuestion, answer.text, liveCitations.length, answerMeta.error]);
    const liveAnswerVisible = (run.runState.runId !== null || !!answer.text || !!answerMeta.error) && !shouldHideDuplicatedLiveAnswer;
    return (_jsxs("section", { id: props.sectionId, className: "chat-workspace-shell", children: [_jsxs("aside", { className: "chat-sidebar", children: [_jsx("button", { className: "primary", disabled: run.isRunning, onClick: () => {
                            resetToNewThread();
                            setQuestion("");
                            setMentionQuery("");
                            setSelectedMention(null);
                            setMentionError("");
                        }, children: "\u65B0\u5EFA\u4F1A\u8BDD" }), _jsxs("div", { className: "chat-thread-list", children: [threads.map((item) => (_jsxs("button", { className: `chat-thread-item ${selectedThreadId === item.id ? "active" : ""}`, disabled: run.isRunning, onClick: () => {
                                    setSelectedThreadId(item.id);
                                    initializedSelectionRef.current = true;
                                }, children: [_jsx("div", { className: "chat-thread-title", children: item.title || "未命名会话" }), _jsx("div", { className: "chat-thread-meta", children: item.lastMessageAt || item.updatedAt })] }, item.id))), threads.length === 0 ? _jsx("div", { className: "muted", children: "\u6682\u65E0\u4F1A\u8BDD" }) : null] }), threadError ? _jsxs("div", { className: "muted", children: ["\u4F1A\u8BDD\u52A0\u8F7D\u5931\u8D25\uFF1A", threadError] }) : null] }), _jsxs("section", { className: "chat-canvas", children: [_jsxs("header", { className: "chat-canvas-header", children: [_jsxs("div", { children: [_jsx("strong", { children: selectedThread?.title || "新会话" }), _jsxs("div", { className: "muted", children: ["\u72B6\u6001\uFF1A", status] })] }), _jsxs("div", { className: "toolbar", style: { marginBottom: 0 }, children: [_jsx("button", { disabled: run.isRunning, onClick: () => void loadThreads(), children: "\u5237\u65B0\u4F1A\u8BDD" }), _jsx("button", { disabled: run.isRunning, onClick: () => void loadMaterials(), children: "\u5237\u65B0\u8D44\u6599" })] })] }), _jsxs("div", { className: "chat-message-scroll", ref: messageScrollRef, children: [messages.map((msg) => {
                                const roleClass = msg.role === "user" ? "user" : "assistant";
                                const citations = parseMessageCitations(msg.citationsJson);
                                return (_jsxs("article", { className: `chat-bubble ${roleClass}`, children: [_jsxs("div", { className: "chat-bubble-meta", children: [_jsx("span", { children: msg.role === "user" ? "我" : "AI" }), _jsx("span", { children: msg.createdAt })] }), msg.role === "assistant" ? (_jsx(MarkdownMessage, { className: "chat-bubble-content", text: msg.content })) : (_jsx("div", { className: "chat-bubble-content chat-bubble-content-plain", children: msg.content })), citations.length > 0 ? (_jsx("div", { className: "chat-bubble-citations", children: citations.map((citation) => (_jsx("button", { className: "chat-citation-chip", onClick: () => {
                                                    props.onOpenMaterialCitation?.({
                                                        materialId: citation.materialId,
                                                        preferredContentKind: citation.level,
                                                        highlightSnippet: citation.snippet,
                                                    });
                                                }, children: citation.materialTitle }, citation.citationId))) })) : null] }, msg.id));
                            }), optimisticQuestion ? (_jsxs("article", { className: "chat-bubble user optimistic", children: [_jsxs("div", { className: "chat-bubble-meta", children: [_jsx("span", { children: "\u6211" }), _jsx("span", { children: "\u53D1\u9001\u4E2D" })] }), _jsx("div", { className: "chat-bubble-content chat-bubble-content-plain", children: optimisticQuestion })] })) : null, liveAnswerVisible ? (_jsxs("article", { className: "chat-bubble assistant", children: [_jsxs("div", { className: "chat-bubble-meta", children: [_jsx("span", { children: "AI" }), _jsx("span", { children: run.isRunning ? "思考中" : "完成" })] }), answer.text ? (_jsx(MarkdownMessage, { className: "chat-bubble-content", text: answer.text })) : (_jsx("div", { className: "chat-bubble-content chat-bubble-content-plain", children: run.isRunning ? "正在生成回答..." : "" })), answerMeta.error ? _jsx("div", { className: "mention-error", children: answerMeta.error.message }) : null, liveCitations.length > 0 ? (_jsx("div", { className: "chat-bubble-citations", children: liveCitations.map((citation) => (_jsx("button", { className: "chat-citation-chip", onClick: () => {
                                                props.onOpenMaterialCitation?.({
                                                    materialId: citation.materialId,
                                                    preferredContentKind: citation.level,
                                                    highlightSnippet: citation.snippet,
                                                });
                                            }, children: citation.materialTitle }, citation.citationId))) })) : null, canRetry ? (_jsx("div", { className: "toolbar", style: { marginBottom: 0, marginTop: 8 }, children: _jsx("button", { onClick: async () => {
                                                const retryQuestion = run.runState.question.trim();
                                                if (!retryQuestion) {
                                                    return;
                                                }
                                                try {
                                                    const retryScopeOverride = run.runState.scopeType === "material" && run.runState.scopeId
                                                        ? {
                                                            scopeType: "material",
                                                            scopeId: run.runState.scopeId,
                                                        }
                                                        : undefined;
                                                    setOptimisticQuestion(retryQuestion);
                                                    await run.ask({
                                                        threadId: selectedThreadId ?? undefined,
                                                        question: retryQuestion,
                                                        scopeOverride: retryScopeOverride,
                                                    });
                                                }
                                                catch (err) {
                                                    setOptimisticQuestion("");
                                                    window.alert(err instanceof Error ? err.message : "提问失败");
                                                }
                                            }, children: "\u91CD\u8BD5" }) })) : null] })) : null, !messageError && messages.length === 0 && !optimisticQuestion && !liveAnswerVisible ? (_jsx("div", { className: "muted", children: "\u5F00\u59CB\u63D0\u95EE\u5427\u3002\u8F93\u5165 @ \u53EF\u6307\u5B9A\u5355\u8D44\u6599\u4F1A\u8BDD\u3002" })) : null, messageError ? _jsxs("div", { className: "muted", children: ["\u6D88\u606F\u52A0\u8F7D\u5931\u8D25\uFF1A", messageError] }) : null, materialsError ? _jsxs("div", { className: "muted", children: ["\u8D44\u6599\u52A0\u8F7D\u5931\u8D25\uFF1A", materialsError] }) : null] }), _jsx(UnifiedChatAskInputPanel, { question: question, isRunning: run.isRunning, canSubmit: canSubmit, canCancel: run.canCancel, selectedMentionTitle: selectedMention?.title, mentionCandidates: mentionCandidates, mentionError: mentionError, serverHealthError: serverHealthError, onRetryHealthCheck: () => {
                            void runHealthCheck();
                        }, onQuestionChange: (value) => {
                            setQuestion(value);
                            setMentionError("");
                            const selectedTokens = extractSelectedMentionTokens(value);
                            if (selectedTokens.length !== 1) {
                                setSelectedMention(null);
                                return;
                            }
                            if (selectedMention && selectedTokens[0]?.title !== selectedMention.title) {
                                setSelectedMention(null);
                            }
                        }, onMentionQueryChange: setMentionQuery, onSelectMention: (candidate) => {
                            setSelectedMention({
                                materialId: candidate.materialId,
                                title: candidate.title,
                            });
                            setMentionError("");
                            setMentionQuery("");
                        }, onClearMention: () => {
                            setSelectedMention(null);
                            setMentionError("");
                        }, onSubmit: async () => {
                            const content = question.trim();
                            if (!content) {
                                return;
                            }
                            const validation = validateQuestionMention(content, selectedMention?.title ?? null);
                            if (!validation.ok) {
                                setMentionError(validation.errorMessage ?? "请先完成 @文件 选择");
                                return;
                            }
                            if (serverHealthError) {
                                const healthy = await runHealthCheck();
                                if (!healthy) {
                                    return;
                                }
                            }
                            setOptimisticQuestion(content);
                            try {
                                await run.ask({
                                    threadId: selectedThreadId ?? undefined,
                                    question: content,
                                    scopeOverride: selectedMention
                                        ? {
                                            scopeType: "material",
                                            scopeId: selectedMention.materialId,
                                        }
                                        : undefined,
                                    options: {
                                        maxCandidateMaterials: 8,
                                        maxExpandedMaterials: 3,
                                        streamTrace: true,
                                        timeoutMs: 120000,
                                    },
                                });
                                setQuestion("");
                                setMentionQuery("");
                                setMentionError("");
                                setSelectedMention(null);
                                setOptimisticQuestion("");
                            }
                            catch (err) {
                                setOptimisticQuestion("");
                                const message = err instanceof Error ? err.message : "提问失败";
                                if (message.includes("无法连接后端服务") || message.includes("流式提问失败")) {
                                    setServerHealthError(message);
                                }
                                window.alert(message);
                            }
                        }, onCancel: async () => {
                            await run.cancel();
                        } })] })] }));
}
function parseMessageCitations(json) {
    if (!json) {
        return [];
    }
    try {
        const parsed = JSON.parse(json);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
function normalizeForDedup(value) {
    return value.trim().replace(/\r\n/g, "\n");
}
function normalizeMentionTitle(value) {
    return (value ?? "").replace(/[{}]/g, "").trim();
}
