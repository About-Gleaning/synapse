import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ApiResp,
  MaterialContentKind,
  MaterialContentVO,
  MaterialDetailVO,
  MaterialImportVO,
  MaterialListVO,
} from "@synapse/shared";
import { MaterialChatPanelContainer } from "../chat/containers/MaterialChatPanelContainer";
import { buildApiUrl, describeApiBaseUrl } from "../../shared/api/baseUrl";
import { requestJson } from "../../shared/api/httpClient";

export interface MaterialsPanelFocusRequest {
  materialId: string | null;
  threadId: string | null;
  preferredContentKind?: MaterialContentKind;
  highlightSnippet?: string;
  token: number;
}

export interface MaterialsPanelProps {
  sectionId?: string;
  focusRequest?: MaterialsPanelFocusRequest;
}

export function MaterialsPanel(props: MaterialsPanelProps): React.JSX.Element {
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [materials, setMaterials] = useState<MaterialListVO["items"]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [contentKind, setContentKind] = useState<MaterialContentKind>("original");
  const [detail, setDetail] = useState<MaterialDetailVO | null>(null);
  const [detailError, setDetailError] = useState("");
  const [content, setContent] = useState("");
  const [contentError, setContentError] = useState("");
  const [highlightSnippet, setHighlightSnippet] = useState("");
  const [highlightToken, setHighlightToken] = useState(0);
  const highlightRef = useRef<HTMLElement | null>(null);

  const loadMaterials = async (): Promise<void> => {
    try {
      const data = await requestJson<MaterialListVO>("/api/materials?page=1&pageSize=50", { method: "GET" });
      setMaterials(data.items);
    } catch {
      setMaterials([]);
    }
  };

  useEffect(() => {
    void loadMaterials();
  }, []);

  useEffect(() => {
    if (!selectedMaterialId) {
      setDetail(null);
      setDetailError("");
      return;
    }

    void (async () => {
      try {
        const detailJson = await requestJson<MaterialDetailVO>(`/api/materials/${selectedMaterialId}`, {
          method: "GET",
        });
        setDetail(detailJson);
        setDetailError("");
      } catch (error) {
        setDetail(null);
        setDetailError(error instanceof Error ? error.message : "资料详情读取失败");
      }
    })();
  }, [selectedMaterialId]);

  useEffect(() => {
    if (!selectedMaterialId) {
      setContent("");
      setContentError("");
      return;
    }

    void (async () => {
      try {
        const json = await requestJson<MaterialContentVO>(
          `/api/materials/${selectedMaterialId}/content?kind=${contentKind}`,
          { method: "GET" },
        );
        setContent(json.content);
        setContentError("");
      } catch (error) {
        setContent("");
        setContentError(error instanceof Error ? error.message : "内容读取失败");
      }
    })();
  }, [selectedMaterialId, contentKind]);

  const highlightRange = useMemo(() => {
    return findSnippetRange(content, highlightSnippet);
  }, [content, highlightSnippet, highlightToken]);

  useEffect(() => {
    if (!highlightRange || !highlightRef.current) {
      return;
    }
    highlightRef.current.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [highlightRange?.start, selectedMaterialId, contentKind]);

  useEffect(() => {
    if (!props.focusRequest) {
      return;
    }
    if (props.focusRequest.materialId) {
      setSelectedMaterialId(props.focusRequest.materialId);
    }
    if (props.focusRequest.preferredContentKind) {
      setContentKind(props.focusRequest.preferredContentKind);
    }
    if (props.focusRequest.highlightSnippet?.trim()) {
      setHighlightSnippet(props.focusRequest.highlightSnippet.trim());
      setHighlightToken(props.focusRequest.token);
    } else {
      setHighlightSnippet("");
      setHighlightToken(0);
    }
  }, [props.focusRequest?.token]);

  return (
    <section id={props.sectionId} className="panel" style={{ marginBottom: 14 }}>
      <h3>资料导入与查看</h3>
      <div className="toolbar">
        <input
          style={{ minWidth: 420 }}
          placeholder="输入网页 URL"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
        />
        <button
          className="primary"
          disabled={loading || !sourceUrl.trim()}
          onClick={async () => {
            setLoading(true);
            try {
              const resp = await fetch(buildApiUrl("/api/materials/import"), {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  sourceUrl: sourceUrl.trim(),
                  sourceTypeHint: "auto",
                }),
              });
              const json = (await resp.json()) as ApiResp<MaterialImportVO> & {
                data?: { materialId?: string };
              };
              if (json.code === "MATERIAL_DUPLICATE" && json.data?.materialId) {
                setSelectedMaterialId(json.data.materialId);
                setHighlightSnippet("");
                setHighlightToken(0);
                await loadMaterials();
              } else if (json.code !== "OK") {
                window.alert(json.message || "导入资料失败");
              } else {
                setSelectedMaterialId(json.data.materialId);
                setHighlightSnippet("");
                setHighlightToken(0);
                setSourceUrl("");
                await loadMaterials();
              }
            } catch (error) {
              const msg = error instanceof Error ? error.message : "导入资料失败";
              window.alert(`导入资料失败：${msg}。接口基址：${describeApiBaseUrl()}`);
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? "导入中..." : "导入资料"}
        </button>
      </div>

      <div className="toolbar">
        <select
          value={selectedMaterialId ?? ""}
          onChange={(e) => {
            setSelectedMaterialId(e.target.value || null);
            setHighlightSnippet("");
            setHighlightToken(0);
          }}
        >
          <option value="">选择资料</option>
          {materials.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>

        <select
          value={contentKind}
          onChange={(e) => {
            setContentKind(e.target.value as MaterialContentKind);
            setHighlightSnippet("");
            setHighlightToken(0);
          }}
          disabled={!selectedMaterialId}
        >
          <option value="original">原文</option>
          <option value="brief_summary">精简总结</option>
          <option value="detailed_notes">详细整理</option>
        </select>

        <button onClick={() => void loadMaterials()}>刷新列表</button>
      </div>

      <section className="panel" style={{ borderStyle: "dashed", marginBottom: 14 }}>
        <h3>资料详情</h3>
        {!selectedMaterialId ? <div className="muted">请选择资料后查看详情</div> : null}
        {selectedMaterialId && detailError ? <div className="muted">详情读取失败：{detailError}</div> : null}
        {selectedMaterialId && detail ? (
          <div className="material-meta-grid">
            <div>
              <div>
                <strong>标题：</strong>
                {detail.title}
              </div>
              <div className="muted">资料ID：{detail.id}</div>
              <div className="muted">来源类型：{detail.sourceType}</div>
              <div className="muted">状态：{detail.status}</div>
              <div className="muted">抓取阶段：{detail.ingestStage}</div>
            </div>
            <div>
              <div className="muted">精简总结：{detail.briefSummaryStatus}</div>
              <div className="muted">详细整理：{detail.detailedNotesStatus}</div>
              <div className="muted">分类建议：{detail.classifyStatus}</div>
              <div className="muted">创建时间：{detail.createdAt}</div>
              <div className="muted">更新时间：{detail.updatedAt}</div>
            </div>
            <div>
              <div className="muted">分类路径：</div>
              <div>{detail.categories.length > 0 ? detail.categories.map((x) => x.path).join(" / ") : "未绑定分类"}</div>
              <div className="muted" style={{ marginTop: 6 }}>
                原始链接：{detail.originalUrl}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel" style={{ borderStyle: "dashed", marginBottom: 14 }}>
        <h3>资料内容</h3>
        {contentError ? <div className="muted">内容读取失败：{contentError}</div> : null}
        {highlightSnippet ? (
          <div className="muted" style={{ marginBottom: 8 }}>
            {highlightRange ? "已定位到引用片段" : "未匹配到精确片段，已打开对应内容层级"}
          </div>
        ) : null}
        <article className="answer-box">
          {!content ? "请选择资料查看内容" : null}
          {content && highlightRange
            ? (
                <>
                  {content.slice(0, highlightRange.start)}
                  <mark ref={highlightRef}>{content.slice(highlightRange.start, highlightRange.end)}</mark>
                  {content.slice(highlightRange.end)}
                </>
              )
            : content}
        </article>
      </section>

      {selectedMaterialId ? (
        <MaterialChatPanelContainer
          materialId={selectedMaterialId}
          onOpenMaterialCitation={(payload) => {
            if (payload.materialId !== selectedMaterialId) {
              setSelectedMaterialId(payload.materialId);
            }
            setContentKind(payload.level);
            setHighlightSnippet(payload.snippet.trim());
            setHighlightToken((x) => x + 1);
          }}
          focusRequest={
            props.focusRequest && props.focusRequest.materialId === selectedMaterialId
              ? {
                  threadId: props.focusRequest.threadId,
                  token: props.focusRequest.token,
                }
              : undefined
          }
        />
      ) : null}
    </section>
  );
}

function findSnippetRange(content: string, snippet: string): { start: number; end: number } | null {
  const safeSnippet = snippet.trim();
  if (!content || safeSnippet.length < 6) {
    return null;
  }

  const exactIndex = content.indexOf(safeSnippet);
  if (exactIndex >= 0) {
    return {
      start: exactIndex,
      end: exactIndex + safeSnippet.length,
    };
  }

  const normalizedSnippet = safeSnippet.replace(/\s+/g, " ");
  if (normalizedSnippet.length < 6) {
    return null;
  }

  const pattern = new RegExp(escapeRegExp(normalizedSnippet).replace(/\s+/g, "\\s+"), "i");
  const matched = pattern.exec(content);
  if (!matched || typeof matched.index !== "number") {
    return null;
  }

  return {
    start: matched.index,
    end: matched.index + matched[0].length,
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
