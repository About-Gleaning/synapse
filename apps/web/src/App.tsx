import { useRef, useState } from "react";
import { CategoryManagementPanel } from "./features/categories/containers/CategoryManagementPanel";
import { UnifiedChatWorkspace } from "./features/chat/containers/UnifiedChatWorkspace";
import type { GlobalChatFocusRequest } from "./features/chat/containers/GlobalChatPageContainer";
import type { MaterialsPanelFocusRequest } from "./features/materials/MaterialsPanel";
import { MaterialsPanel } from "./features/materials/MaterialsPanel";
import { SettingsPanel } from "./features/settings/SettingsPanel";

type AppTab = "chat" | "materials" | "categories" | "settings";

export function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<AppTab>("chat");
  const [materialFocus, setMaterialFocus] = useState<MaterialsPanelFocusRequest | undefined>(undefined);
  const [chatFocus, setChatFocus] = useState<GlobalChatFocusRequest | undefined>(undefined);
  const jumpTokenRef = useRef(0);

  const nextJumpToken = (): number => {
    jumpTokenRef.current += 1;
    return jumpTokenRef.current;
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>Synapse 学习资料助手</h1>
        <p>基于本地资料的流式问答与渐进式检索</p>
      </header>

      <div className="app-main-layout">
        <aside className="side-nav-panel">
          <nav className="tab-nav side-tab-nav" role="tablist" aria-label="主导航">
            <button
              role="tab"
              aria-selected={activeTab === "chat"}
              className={activeTab === "chat" ? "active" : ""}
              onClick={() => setActiveTab("chat")}
            >
              问答
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "materials"}
              className={activeTab === "materials" ? "active" : ""}
              onClick={() => setActiveTab("materials")}
            >
              资料
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "categories"}
              className={activeTab === "categories" ? "active" : ""}
              onClick={() => setActiveTab("categories")}
            >
              分类
            </button>
          </nav>
          <button
            className={`tab-settings-btn side-settings-btn ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
          >
            设置
          </button>
        </aside>

        <div className="tab-content-area">
          <section className="tab-panel" hidden={activeTab !== "chat"} aria-hidden={activeTab !== "chat"}>
            <UnifiedChatWorkspace
              focusRequest={chatFocus}
              onNavigateToMaterials={() => {
                setActiveTab("materials");
              }}
              onOpenMaterialCitation={(payload) => {
                setMaterialFocus({
                  materialId: payload.materialId,
                  threadId: null,
                  preferredContentKind: payload.preferredContentKind,
                  highlightSnippet: payload.highlightSnippet,
                  token: nextJumpToken(),
                });
                setActiveTab("materials");
              }}
            />
          </section>

          <section className="tab-panel" hidden={activeTab !== "materials"} aria-hidden={activeTab !== "materials"}>
            <MaterialsPanel
              focusRequest={materialFocus}
              onNavigateToChatWithMention={(payload) => {
                setChatFocus({
                  threadId: null,
                  mentionMaterialId: payload.materialId,
                  mentionMaterialTitle: payload.materialTitle,
                  forceNewThread: payload.forceNewThread ?? true,
                  token: nextJumpToken(),
                });
                setActiveTab("chat");
              }}
            />
          </section>

          <section className="tab-panel" hidden={activeTab !== "categories"} aria-hidden={activeTab !== "categories"}>
            <CategoryManagementPanel />
          </section>

          <section className="tab-panel" hidden={activeTab !== "settings"} aria-hidden={activeTab !== "settings"}>
            <SettingsPanel />
          </section>
        </div>
      </div>
    </main>
  );
}
