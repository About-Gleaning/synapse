import { useEffect, useMemo, useRef, useState } from "react";
import type { MaterialContentKind, MaterialListVO } from "@synapse/shared";
import type { GlobalChatFocusRequest } from "./GlobalChatPageContainer";
import { GlobalChatPageContainer } from "./GlobalChatPageContainer";
import { ChatHistoryHubPanel } from "./ChatHistoryHubPanel";
import { MaterialChatPanelContainer } from "./MaterialChatPanelContainer";
import { requestJson } from "../../../shared/api/httpClient";

type ChatMode = "global" | "material";

interface MaterialFocusRequest {
  threadId: string | null;
  token: number;
}

export interface UnifiedChatWorkspaceProps {
  onOpenMaterialCitation?: (payload: {
    materialId: string;
    preferredContentKind: MaterialContentKind;
    highlightSnippet: string;
  }) => void;
  onNavigateToMaterials?: () => void;
}

export function UnifiedChatWorkspace(props: UnifiedChatWorkspaceProps): React.JSX.Element {
  const [chatMode, setChatMode] = useState<ChatMode>("global");
  const [materialId, setMaterialId] = useState<string>("");
  const [materials, setMaterials] = useState<MaterialListVO["items"]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState("");
  const [globalFocus, setGlobalFocus] = useState<GlobalChatFocusRequest | undefined>(undefined);
  const [materialFocus, setMaterialFocus] = useState<MaterialFocusRequest | undefined>(undefined);
  const jumpTokenRef = useRef(0);

  const nextJumpToken = (): number => {
    jumpTokenRef.current += 1;
    return jumpTokenRef.current;
  };

  const loadMaterials = async (): Promise<void> => {
    setMaterialsLoading(true);
    setMaterialsError("");
    try {
      const data = await requestJson<MaterialListVO>("/api/materials?page=1&pageSize=50", {
        method: "GET",
      });
      setMaterials(data.items);
    } catch (error) {
      setMaterialsError(error instanceof Error ? error.message : "资料列表加载失败");
    } finally {
      setMaterialsLoading(false);
    }
  };

  useEffect(() => {
    void loadMaterials();
  }, []);

  useEffect(() => {
    if (chatMode !== "material") {
      return;
    }
    if (!materialId && materials.length > 0) {
      setMaterialId(materials[0].id);
    }
  }, [chatMode, materialId, materials]);

  const selectedMaterialTitle = useMemo(() => {
    return materials.find((item) => item.id === materialId)?.title ?? "";
  }, [materialId, materials]);

  return (
    <section>
      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>问答工作台</h3>
        <div className="chat-mode-toolbar">
          <button
            className={chatMode === "global" ? "primary" : ""}
            onClick={() => {
              setChatMode("global");
            }}
          >
            全局会话
          </button>
          <button
            className={chatMode === "material" ? "primary" : ""}
            onClick={() => {
              setChatMode("material");
              setMaterialFocus(undefined);
            }}
          >
            单资料会话
          </button>
          <span className="muted">
            {chatMode === "global"
              ? "跨全部资料提问"
              : selectedMaterialTitle
              ? `当前资料：${selectedMaterialTitle}`
              : "请选择资料后开始单资料会话"}
          </span>
        </div>
      </section>

      <ChatHistoryHubPanel
        onOpenGlobalThread={(threadId) => {
          setChatMode("global");
          setGlobalFocus({
            threadId,
            token: nextJumpToken(),
          });
        }}
        onOpenMaterialThread={(nextMaterialId, threadId) => {
          setChatMode("material");
          setMaterialId(nextMaterialId);
          setMaterialFocus({
            threadId,
            token: nextJumpToken(),
          });
        }}
      />

      {chatMode === "global" ? (
        <GlobalChatPageContainer
          focusRequest={globalFocus}
          onOpenMaterialCitation={(payload) => {
            props.onOpenMaterialCitation?.(payload);
          }}
        />
      ) : (
        <section>
          <section className="panel" style={{ marginBottom: 14 }}>
            <h3>单资料会话范围</h3>
            <div className="toolbar">
              <select
                value={materialId}
                onChange={(e) => {
                  setMaterialId(e.target.value);
                  setMaterialFocus(undefined);
                }}
                disabled={materialsLoading || materials.length === 0}
              >
                <option value="">请选择资料</option>
                {materials.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
              <button onClick={() => void loadMaterials()} disabled={materialsLoading}>
                {materialsLoading ? "刷新中..." : "刷新资料列表"}
              </button>
              <button onClick={() => props.onNavigateToMaterials?.()}>去资料页管理</button>
            </div>
            {materialsError ? <div className="muted">资料列表加载失败：{materialsError}</div> : null}
          </section>

          {!materialId ? (
            <section className="panel" style={{ marginBottom: 14 }}>
              <h3>开始提问前</h3>
              <div className="muted">当前没有可用资料，请先导入资料，或在上方选择已有资料。</div>
              <div className="toolbar" style={{ marginTop: 10 }}>
                <button className="primary" onClick={() => props.onNavigateToMaterials?.()}>
                  前往资料页
                </button>
              </div>
            </section>
          ) : (
            <MaterialChatPanelContainer
              materialId={materialId}
              focusRequest={materialFocus}
              onOpenMaterialCitation={(payload) => {
                props.onOpenMaterialCitation?.({
                  materialId: payload.materialId,
                  preferredContentKind: payload.level,
                  highlightSnippet: payload.snippet,
                });
              }}
            />
          )}
        </section>
      )}
    </section>
  );
}
