import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessageVO, ChatThreadListItemVO, MaterialContentKind, MaterialListVO } from "@synapse/shared";
import { requestJson } from "../../../shared/api/httpClient";
import { checkServerHealth, getThreadMessages, listThreads } from "../api/chatApi";
import { MarkdownMessage } from "../components/MarkdownMessage";
import { UnifiedChatAskInputPanel } from "../components/UnifiedChatAskInputPanel";
import { useChatStreamRun } from "../hooks/useChatStreamRun";
import { selectAnswerMeta, selectAnswerText, selectCanRetry, selectCitations, selectRunStatus } from "../model/chatRunSelectors";
import { extractSelectedMentionTokens, validateQuestionMention } from "../model/mentionUtils";

interface SelectedMention {
  materialId: string;
  title: string;
}

interface MessageCitation {
  citationId: string;
  materialId: string;
  materialTitle: string;
  level: "brief_summary" | "detailed_notes" | "original";
  snippet: string;
}

export interface GlobalChatFocusRequest {
  threadId?: string | null;
  mentionMaterialId?: string;
  mentionMaterialTitle?: string;
  forceNewThread?: boolean;
  token: number;
}

export interface GlobalChatPageContainerProps {
  sectionId?: string;
  focusRequest?: GlobalChatFocusRequest;
  onOpenMaterialCitation?: (payload: {
    materialId: string;
    preferredContentKind: MaterialContentKind;
    highlightSnippet: string;
  }) => void;
}

export function GlobalChatPageContainer(props: GlobalChatPageContainerProps): React.JSX.Element {
  const [question, setQuestion] = useState("");
  const [mentionQuery, setMentionQuery] = useState("");
  const [selectedMention, setSelectedMention] = useState<SelectedMention | null>(null);
  const [mentionError, setMentionError] = useState("");
  const [optimisticQuestion, setOptimisticQuestion] = useState("");

  const [materials, setMaterials] = useState<MaterialListVO["items"]>([]);
  const [materialsError, setMaterialsError] = useState("");
  const [threads, setThreads] = useState<ChatThreadListItemVO[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageVO[]>([]);
  const [threadError, setThreadError] = useState("");
  const [messageError, setMessageError] = useState("");
  const [serverHealthError, setServerHealthError] = useState("");
  const [serverChecking, setServerChecking] = useState(false);
  const initializedSelectionRef = useRef(false);
  const messageScrollRef = useRef<HTMLDivElement | null>(null);

  const runHealthCheck = async (): Promise<boolean> => {
    setServerChecking(true);
    try {
      await checkServerHealth();
      setServerHealthError("");
      return true;
    } catch (error) {
      setServerHealthError(error instanceof Error ? error.message : "后端服务不可用");
      return false;
    } finally {
      setServerChecking(false);
    }
  };

  const loadMaterials = async (): Promise<void> => {
    try {
      setMaterialsError("");
      const data = await requestJson<MaterialListVO>("/api/materials?page=1&pageSize=200", {
        method: "GET",
      });
      setMaterials(data.items);
    } catch (error) {
      setMaterials([]);
      setMaterialsError(error instanceof Error ? error.message : "资料列表加载失败");
    }
  };

  const loadThreads = async (): Promise<ChatThreadListItemVO[]> => {
    try {
      setThreadError("");
      const data = await listThreads({
        page: 1,
        pageSize: 50,
      });
      setThreads(data.items);
      return data.items;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "加载会话列表失败";
      setThreadError(msg);
      return [];
    }
  };

  const loadMessages = async (threadId: string): Promise<void> => {
    try {
      setMessageError("");
      const data = await getThreadMessages(threadId);
      setMessages(data);
    } catch (error) {
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

  const resetToNewThread = (): void => {
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

  return (
    <section id={props.sectionId} className="chat-workspace-shell">
      <aside className="chat-sidebar">
        <button
          className="primary"
          disabled={run.isRunning}
          onClick={() => {
            resetToNewThread();
            setQuestion("");
            setMentionQuery("");
            setSelectedMention(null);
            setMentionError("");
          }}
        >
          新建会话
        </button>

        <div className="chat-thread-list">
          {threads.map((item) => (
            <button
              key={item.id}
              className={`chat-thread-item ${selectedThreadId === item.id ? "active" : ""}`}
              disabled={run.isRunning}
              onClick={() => {
                setSelectedThreadId(item.id);
                initializedSelectionRef.current = true;
              }}
            >
              <div className="chat-thread-title">{item.title || "未命名会话"}</div>
              <div className="chat-thread-meta">{item.lastMessageAt || item.updatedAt}</div>
            </button>
          ))}
          {threads.length === 0 ? <div className="muted">暂无会话</div> : null}
        </div>
        {threadError ? <div className="muted">会话加载失败：{threadError}</div> : null}
      </aside>

      <section className="chat-canvas">
        <header className="chat-canvas-header">
          <div>
            <strong>{selectedThread?.title || "新会话"}</strong>
            <div className="muted">状态：{status}</div>
          </div>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <button disabled={run.isRunning} onClick={() => void loadThreads()}>
              刷新会话
            </button>
            <button disabled={run.isRunning} onClick={() => void loadMaterials()}>
              刷新资料
            </button>
          </div>
        </header>

        <div className="chat-message-scroll" ref={messageScrollRef}>
          {messages.map((msg) => {
            const roleClass = msg.role === "user" ? "user" : "assistant";
            const citations = parseMessageCitations(msg.citationsJson);
            return (
              <article key={msg.id} className={`chat-bubble ${roleClass}`}>
                <div className="chat-bubble-meta">
                  <span>{msg.role === "user" ? "我" : "AI"}</span>
                  <span>{msg.createdAt}</span>
                </div>
                {msg.role === "assistant" ? (
                  <MarkdownMessage className="chat-bubble-content" text={msg.content} />
                ) : (
                  <div className="chat-bubble-content chat-bubble-content-plain">{msg.content}</div>
                )}
                {citations.length > 0 ? (
                  <div className="chat-bubble-citations">
                    {citations.map((citation) => (
                      <button
                        key={citation.citationId}
                        className="chat-citation-chip"
                        onClick={() => {
                          props.onOpenMaterialCitation?.({
                            materialId: citation.materialId,
                            preferredContentKind: citation.level,
                            highlightSnippet: citation.snippet,
                          });
                        }}
                      >
                        {citation.materialTitle}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}

          {optimisticQuestion ? (
            <article className="chat-bubble user optimistic">
              <div className="chat-bubble-meta">
                <span>我</span>
                <span>发送中</span>
              </div>
              <div className="chat-bubble-content chat-bubble-content-plain">{optimisticQuestion}</div>
            </article>
          ) : null}

          {liveAnswerVisible ? (
            <article className="chat-bubble assistant">
              <div className="chat-bubble-meta">
                <span>AI</span>
                <span>{run.isRunning ? "思考中" : "完成"}</span>
              </div>
              {answer.text ? (
                <MarkdownMessage className="chat-bubble-content" text={answer.text} />
              ) : (
                <div className="chat-bubble-content chat-bubble-content-plain">{run.isRunning ? "正在生成回答..." : ""}</div>
              )}
              {answerMeta.error ? <div className="mention-error">{answerMeta.error.message}</div> : null}
              {liveCitations.length > 0 ? (
                <div className="chat-bubble-citations">
                  {liveCitations.map((citation) => (
                    <button
                      key={citation.citationId}
                      className="chat-citation-chip"
                      onClick={() => {
                        props.onOpenMaterialCitation?.({
                          materialId: citation.materialId,
                          preferredContentKind: citation.level,
                          highlightSnippet: citation.snippet,
                        });
                      }}
                    >
                      {citation.materialTitle}
                    </button>
                  ))}
                </div>
              ) : null}
              {canRetry ? (
                <div className="toolbar" style={{ marginBottom: 0, marginTop: 8 }}>
                  <button
                    onClick={async () => {
                      const retryQuestion = run.runState.question.trim();
                      if (!retryQuestion) {
                        return;
                      }
                      try {
                        const retryScopeOverride =
                          run.runState.scopeType === "material" && run.runState.scopeId
                            ? {
                                scopeType: "material" as const,
                                scopeId: run.runState.scopeId,
                              }
                            : undefined;
                        setOptimisticQuestion(retryQuestion);
                        await run.ask({
                          threadId: selectedThreadId ?? undefined,
                          question: retryQuestion,
                          scopeOverride: retryScopeOverride,
                        });
                      } catch (err) {
                        setOptimisticQuestion("");
                        window.alert(err instanceof Error ? err.message : "提问失败");
                      }
                    }}
                  >
                    重试
                  </button>
                </div>
              ) : null}
            </article>
          ) : null}

          {!messageError && messages.length === 0 && !optimisticQuestion && !liveAnswerVisible ? (
            <div className="muted">开始提问吧。输入 @ 可指定单资料会话。</div>
          ) : null}
          {messageError ? <div className="muted">消息加载失败：{messageError}</div> : null}
          {materialsError ? <div className="muted">资料加载失败：{materialsError}</div> : null}
        </div>

        <UnifiedChatAskInputPanel
          question={question}
          isRunning={run.isRunning}
          canSubmit={canSubmit}
          canCancel={run.canCancel}
          selectedMentionTitle={selectedMention?.title}
          mentionCandidates={mentionCandidates}
          mentionError={mentionError}
          serverHealthError={serverHealthError}
          onRetryHealthCheck={() => {
            void runHealthCheck();
          }}
          onQuestionChange={(value) => {
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
          }}
          onMentionQueryChange={setMentionQuery}
          onSelectMention={(candidate) => {
            setSelectedMention({
              materialId: candidate.materialId,
              title: candidate.title,
            });
            setMentionError("");
            setMentionQuery("");
          }}
          onClearMention={() => {
            setSelectedMention(null);
            setMentionError("");
          }}
          onSubmit={async () => {
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
            } catch (err) {
              setOptimisticQuestion("");
              const message = err instanceof Error ? err.message : "提问失败";
              if (message.includes("无法连接后端服务") || message.includes("流式提问失败")) {
                setServerHealthError(message);
              }
              window.alert(message);
            }
          }}
          onCancel={async () => {
            await run.cancel();
          }}
        />
      </section>
    </section>
  );
}

function parseMessageCitations(json: string | null): MessageCitation[] {
  if (!json) {
    return [];
  }
  try {
    const parsed = JSON.parse(json) as MessageCitation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeForDedup(value: string): string {
  return value.trim().replace(/\r\n/g, "\n");
}

function normalizeMentionTitle(value?: string): string {
  return (value ?? "").replace(/[{}]/g, "").trim();
}
