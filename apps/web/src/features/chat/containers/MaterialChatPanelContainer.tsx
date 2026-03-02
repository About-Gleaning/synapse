import { useEffect, useMemo, useRef, useState } from "react";
import type { CategoryNodeVO, ChatMessageVO, ChatThreadListItemVO } from "@synapse/shared";
import { checkServerHealth, getThreadMessages, listThreads } from "../api/chatApi";
import { ChatAnswerPanel } from "../components/ChatAnswerPanel";
import { ChatAskInputPanel } from "../components/ChatAskInputPanel";
import { ChatCitationsPanel } from "../components/ChatCitationsPanel";
import { MarkdownMessage } from "../components/MarkdownMessage";
import { ChatProgressPanel } from "../components/ChatProgressPanel";
import { ChatRunStatusBadge } from "../components/ChatRunStatusBadge";
import { ChatTracePanel } from "../components/ChatTracePanel";
import { useChatStreamRun } from "../hooks/useChatStreamRun";
import {
  selectAnswerMeta,
  selectAnswerText,
  selectCitations,
  selectOverallProgress,
  selectRecoveryHint,
  selectRunStatus,
  selectStageTimeline,
  selectTraceTimeline,
} from "../model/chatRunSelectors";
import { getCategoryTree } from "../../categories/api/categoryApi";

export interface MaterialChatPanelContainerProps {
  materialId: string;
  focusRequest?: {
    threadId: string | null;
    token: number;
  };
  onOpenMaterialCitation?: (payload: {
    materialId: string;
    level: "brief_summary" | "detailed_notes" | "original";
    snippet: string;
  }) => void;
}

export function MaterialChatPanelContainer(props: MaterialChatPanelContainerProps): React.JSX.Element {
  const [question, setQuestion] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<Array<{ id: string; path: string; depth: number }>>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState("");
  const [threads, setThreads] = useState<ChatThreadListItemVO[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageVO[]>([]);
  const [threadError, setThreadError] = useState("");
  const [messageError, setMessageError] = useState("");
  const [serverHealthError, setServerHealthError] = useState("");
  const [serverChecking, setServerChecking] = useState(false);
  const initializedSelectionRef = useRef(false);

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

  const loadThreads = async (): Promise<ChatThreadListItemVO[]> => {
    try {
      setThreadError("");
      const data = await listThreads({
        scopeType: "material",
        scopeId: props.materialId,
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

  const loadCategoryOptions = async (): Promise<void> => {
    setCategoryLoading(true);
    setCategoryError("");
    try {
      const tree = await getCategoryTree();
      setCategoryOptions(flattenCategoryNodes(tree.nodes));
    } catch (error) {
      setCategoryOptions([]);
      setCategoryError(error instanceof Error ? error.message : "分类加载失败");
    } finally {
      setCategoryLoading(false);
    }
  };

  const run = useChatStreamRun({
    mode: "material",
    materialId: props.materialId,
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
    setQuestion("");
    setCategoryIds([]);
    setCategoryOptions([]);
    setCategoryError("");
    setThreads([]);
    setMessages([]);
    setSelectedThreadId(null);
    setThreadError("");
    setMessageError("");
    initializedSelectionRef.current = false;
    run.resetRunView();

    void (async () => {
      await runHealthCheck();
      await loadCategoryOptions();
      const loaded = await loadThreads();
      if (!initializedSelectionRef.current && loaded.length > 0) {
        setSelectedThreadId(loaded[0].id);
        initializedSelectionRef.current = true;
      }
    })();
  }, [props.materialId]);

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
  const canSubmit = useMemo(() => {
    return question.trim().length > 0 && !run.isRunning && !serverChecking && !serverHealthError;
  }, [question, run.isRunning, serverChecking, serverHealthError]);

  return (
    <section>
      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>单资料会话</h3>
        <div className="toolbar">
          <ChatRunStatusBadge status={status} />
          <span className="muted">Thread: {selectedThreadId ?? "新会话"}</span>
          <span className="muted">Run: {run.lastRunId ?? "-"}</span>
        </div>
        {recoveryHint ? <div className="muted">{recoveryHint}</div> : null}
        <div className="toolbar">
          <select
            value={selectedThreadId ?? ""}
            onChange={(e) => {
              setSelectedThreadId(e.target.value || null);
              initializedSelectionRef.current = true;
            }}
          >
            <option value="">新会话（不加载历史）</option>
            {threads.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}（{item.messageCount} 条）
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setSelectedThreadId(null);
              setMessages([]);
              run.resetRunView();
              initializedSelectionRef.current = true;
            }}
          >
            新建会话
          </button>
          <button
            onClick={async () => {
              const loaded = await loadThreads();
              if (!selectedThreadId && loaded.length > 0 && !initializedSelectionRef.current) {
                setSelectedThreadId(loaded[0].id);
                initializedSelectionRef.current = true;
              }
            }}
          >
            刷新会话
          </button>
        </div>
        {threadError ? <div className="muted">会话列表加载失败：{threadError}</div> : null}
      </section>

      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>历史消息</h3>
        {selectedThreadId ? null : <div className="muted">当前为新会话，发送问题后自动创建线程</div>}
        {messageError ? <div className="muted">消息加载失败：{messageError}</div> : null}
        {messages.length === 0 ? <div className="muted">暂无历史消息</div> : null}
        {messages.map((msg) => (
          <article key={msg.id} className="trace-item">
            <div className="toolbar" style={{ marginBottom: 6 }}>
              <strong>{msg.role === "user" ? "我" : msg.role === "assistant" ? "助手" : msg.role}</strong>
              <span className="muted">{msg.createdAt}</span>
            </div>
            <div className="answer-box" style={{ minHeight: 0 }}>
              {msg.role === "assistant" ? (
                <MarkdownMessage text={msg.content} />
              ) : (
                <div className="answer-box-plain">{msg.content}</div>
              )}
            </div>
          </article>
        ))}
      </section>

      <ChatAskInputPanel
        question={question}
        isRunning={run.isRunning}
        canSubmit={canSubmit}
        canCancel={run.canCancel}
        selectedCategoryIds={categoryIds}
        categoryOptions={categoryOptions}
        categoryOptionsLoading={categoryLoading}
        categoryOptionsError={categoryError}
        serverHealthError={serverHealthError}
        onRetryHealthCheck={() => {
          void runHealthCheck();
        }}
        onQuestionChange={setQuestion}
        onChangeCategoryIds={setCategoryIds}
        onSubmit={async () => {
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
            });
            setQuestion("");
          } catch (err) {
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

      <div className="chat-layout">
        <div className="chat-col">
          <ChatProgressPanel overallProgress={overallProgress} runStatus={status} stages={stageTimeline} />
        </div>
        <div className="chat-col">
          <ChatAnswerPanel
            text={answer.text}
            isStreaming={answer.isStreaming}
            isFinal={answer.isFinal}
            status={status}
            error={answerMeta.error}
            citationIds={answerMeta.citationIds}
          />
          <ChatTracePanel
            items={traceTimeline}
            isRunning={run.isRunning}
            hasFinalTrace={run.runState.traceSteps.some((x) => x.source === "trace.final")}
          />
        </div>
        <div className="chat-col">
          <ChatCitationsPanel
            citations={citations}
            isRunning={run.isRunning}
            onOpenMaterial={(payload) => {
              props.onOpenMaterialCitation?.({
                materialId: payload.materialId,
                level: payload.level,
                snippet: payload.snippet,
              });
            }}
          />
        </div>
      </div>
    </section>
  );
}

function flattenCategoryNodes(
  nodes: CategoryNodeVO[],
  depth = 0,
): Array<{ id: string; path: string; depth: number }> {
  const result: Array<{ id: string; path: string; depth: number }> = [];
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
