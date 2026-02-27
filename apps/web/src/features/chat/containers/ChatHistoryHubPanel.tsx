import { useEffect, useMemo, useState } from "react";
import type { ChatThreadListVO } from "@synapse/shared";
import { listThreads } from "../api/chatApi";

type ScopeFilter = "all" | "global" | "material";

export interface ChatHistoryHubPanelProps {
  onOpenGlobalThread: (threadId: string) => void;
  onOpenMaterialThread: (materialId: string, threadId: string) => void;
}

export function ChatHistoryHubPanel(props: ChatHistoryHubPanelProps): React.JSX.Element {
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ChatThreadListVO>({
    total: 0,
    page: 1,
    pageSize: 12,
    items: [],
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    void (async () => {
      try {
        const resp = await listThreads({
          scopeType: scopeFilter === "all" ? undefined : scopeFilter,
          keyword: keyword || undefined,
          page,
          pageSize: data.pageSize,
        });
        if (!active) {
          return;
        }
        setData(resp);
      } catch (err) {
        if (!active) {
          return;
        }
        setError(err instanceof Error ? err.message : "会话检索失败");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [scopeFilter, keyword, page]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(data.total / data.pageSize));
  }, [data.total, data.pageSize]);

  return (
    <section className="panel" style={{ marginBottom: 14 }}>
      <h3>会话历史统一入口</h3>
      <div className="history-hub-toolbar">
        <select
          value={scopeFilter}
          onChange={(e) => {
            setScopeFilter(e.target.value as ScopeFilter);
            setPage(1);
          }}
        >
          <option value="all">全部范围</option>
          <option value="global">仅全局会话</option>
          <option value="material">仅单资料会话</option>
        </select>
        <input
          placeholder="检索标题/线程ID/资料标题"
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setKeyword(keywordInput.trim());
              setPage(1);
            }
          }}
        />
        <button
          onClick={() => {
            setKeyword(keywordInput.trim());
            setPage(1);
          }}
        >
          检索
        </button>
        <button
          onClick={() => {
            setKeywordInput("");
            setKeyword("");
            setScopeFilter("all");
            setPage(1);
          }}
        >
          重置
        </button>
      </div>
      <div className="toolbar">
        <span className="muted">
          共 {data.total} 条线程，当前第 {data.page}/{totalPages} 页
        </span>
        {loading ? <span className="muted">加载中...</span> : null}
      </div>
      {error ? <div className="muted">检索失败：{error}</div> : null}
      {!loading && data.items.length === 0 ? <div className="muted">暂无匹配会话</div> : null}
      {data.items.map((item) => (
        <article key={item.id} className="history-hub-item">
          <div className="history-hub-main">
            <strong>{item.title}</strong>
            <div className="muted">
              范围：{item.scopeType === "global" ? "全局会话" : "单资料会话"}
              {item.scopeType === "material" ? `（${item.scopeTitle || item.scopeId || "未知资料"}）` : ""}
            </div>
            <div className="muted">
              消息数：{item.messageCount}，最近消息：{item.lastMessageAt || "暂无"}
            </div>
            <div className="muted">线程ID：{item.id}</div>
          </div>
          <div>
            <button
              onClick={() => {
                if (item.scopeType === "global") {
                  props.onOpenGlobalThread(item.id);
                  return;
                }
                if (item.scopeId) {
                  props.onOpenMaterialThread(item.scopeId, item.id);
                }
              }}
              disabled={item.scopeType === "material" && !item.scopeId}
            >
              打开会话
            </button>
          </div>
        </article>
      ))}
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <button disabled={page <= 1} onClick={() => setPage((x) => Math.max(1, x - 1))}>
          上一页
        </button>
        <button disabled={page >= totalPages} onClick={() => setPage((x) => Math.min(totalPages, x + 1))}>
          下一页
        </button>
      </div>
    </section>
  );
}
