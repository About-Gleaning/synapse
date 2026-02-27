import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useState } from "react";
import { CategoryManagementPanel } from "./features/categories/containers/CategoryManagementPanel";
import { UnifiedChatWorkspace } from "./features/chat/containers/UnifiedChatWorkspace";
import { MaterialsPanel } from "./features/materials/MaterialsPanel";
import { SettingsPanel } from "./features/settings/SettingsPanel";
export function App() {
    const [activeTab, setActiveTab] = useState("chat");
    const [materialFocus, setMaterialFocus] = useState(undefined);
    const jumpTokenRef = useRef(0);
    const nextJumpToken = () => {
        jumpTokenRef.current += 1;
        return jumpTokenRef.current;
    };
    return (_jsxs("main", { className: "app-shell", children: [_jsxs("header", { className: "app-header", children: [_jsx("h1", { children: "Synapse \u5B66\u4E60\u8D44\u6599\u52A9\u624B" }), _jsx("p", { children: "\u57FA\u4E8E\u672C\u5730\u8D44\u6599\u7684\u6D41\u5F0F\u95EE\u7B54\u4E0E\u6E10\u8FDB\u5F0F\u68C0\u7D22" })] }), _jsxs("nav", { className: "tab-nav", role: "tablist", "aria-label": "\u4E3B\u5BFC\u822A", children: [_jsx("button", { role: "tab", "aria-selected": activeTab === "chat", className: activeTab === "chat" ? "active" : "", onClick: () => setActiveTab("chat"), children: "\u95EE\u7B54" }), _jsx("button", { role: "tab", "aria-selected": activeTab === "materials", className: activeTab === "materials" ? "active" : "", onClick: () => setActiveTab("materials"), children: "\u8D44\u6599" }), _jsx("button", { role: "tab", "aria-selected": activeTab === "categories", className: activeTab === "categories" ? "active" : "", onClick: () => setActiveTab("categories"), children: "\u5206\u7C7B" }), _jsx("button", { role: "tab", "aria-selected": activeTab === "settings", className: activeTab === "settings" ? "active" : "", onClick: () => setActiveTab("settings"), children: "\u8BBE\u7F6E" })] }), _jsx("section", { className: "tab-panel", hidden: activeTab !== "chat", "aria-hidden": activeTab !== "chat", children: _jsx(UnifiedChatWorkspace, { onNavigateToMaterials: () => {
                        setActiveTab("materials");
                    }, onOpenMaterialCitation: (payload) => {
                        setMaterialFocus({
                            materialId: payload.materialId,
                            threadId: null,
                            preferredContentKind: payload.preferredContentKind,
                            highlightSnippet: payload.highlightSnippet,
                            token: nextJumpToken(),
                        });
                        setActiveTab("materials");
                    } }) }), _jsx("section", { className: "tab-panel", hidden: activeTab !== "materials", "aria-hidden": activeTab !== "materials", children: _jsx(MaterialsPanel, { focusRequest: materialFocus }) }), _jsx("section", { className: "tab-panel", hidden: activeTab !== "categories", "aria-hidden": activeTab !== "categories", children: _jsx(CategoryManagementPanel, {}) }), _jsx("section", { className: "tab-panel", hidden: activeTab !== "settings", "aria-hidden": activeTab !== "settings", children: _jsx(SettingsPanel, {}) })] }));
}
