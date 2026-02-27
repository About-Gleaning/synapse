import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { GlobalChatPageContainer } from "./GlobalChatPageContainer";
import { ChatHistoryHubPanel } from "./ChatHistoryHubPanel";
import { MaterialChatPanelContainer } from "./MaterialChatPanelContainer";
import { requestJson } from "../../../shared/api/httpClient";
export function UnifiedChatWorkspace(props) {
    const [chatMode, setChatMode] = useState("global");
    const [materialId, setMaterialId] = useState("");
    const [materials, setMaterials] = useState([]);
    const [materialsLoading, setMaterialsLoading] = useState(false);
    const [materialsError, setMaterialsError] = useState("");
    const [globalFocus, setGlobalFocus] = useState(undefined);
    const [materialFocus, setMaterialFocus] = useState(undefined);
    const jumpTokenRef = useRef(0);
    const nextJumpToken = () => {
        jumpTokenRef.current += 1;
        return jumpTokenRef.current;
    };
    const loadMaterials = async () => {
        setMaterialsLoading(true);
        setMaterialsError("");
        try {
            const data = await requestJson("/api/materials?page=1&pageSize=50", {
                method: "GET",
            });
            setMaterials(data.items);
        }
        catch (error) {
            setMaterialsError(error instanceof Error ? error.message : "资料列表加载失败");
        }
        finally {
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
    return (_jsxs("section", { children: [_jsxs("section", { className: "panel", style: { marginBottom: 14 }, children: [_jsx("h3", { children: "\u95EE\u7B54\u5DE5\u4F5C\u53F0" }), _jsxs("div", { className: "chat-mode-toolbar", children: [_jsx("button", { className: chatMode === "global" ? "primary" : "", onClick: () => {
                                    setChatMode("global");
                                }, children: "\u5168\u5C40\u4F1A\u8BDD" }), _jsx("button", { className: chatMode === "material" ? "primary" : "", onClick: () => {
                                    setChatMode("material");
                                    setMaterialFocus(undefined);
                                }, children: "\u5355\u8D44\u6599\u4F1A\u8BDD" }), _jsx("span", { className: "muted", children: chatMode === "global"
                                    ? "跨全部资料提问"
                                    : selectedMaterialTitle
                                        ? `当前资料：${selectedMaterialTitle}`
                                        : "请选择资料后开始单资料会话" })] })] }), _jsx(ChatHistoryHubPanel, { onOpenGlobalThread: (threadId) => {
                    setChatMode("global");
                    setGlobalFocus({
                        threadId,
                        token: nextJumpToken(),
                    });
                }, onOpenMaterialThread: (nextMaterialId, threadId) => {
                    setChatMode("material");
                    setMaterialId(nextMaterialId);
                    setMaterialFocus({
                        threadId,
                        token: nextJumpToken(),
                    });
                } }), chatMode === "global" ? (_jsx(GlobalChatPageContainer, { focusRequest: globalFocus, onOpenMaterialCitation: (payload) => {
                    props.onOpenMaterialCitation?.(payload);
                } })) : (_jsxs("section", { children: [_jsxs("section", { className: "panel", style: { marginBottom: 14 }, children: [_jsx("h3", { children: "\u5355\u8D44\u6599\u4F1A\u8BDD\u8303\u56F4" }), _jsxs("div", { className: "toolbar", children: [_jsxs("select", { value: materialId, onChange: (e) => {
                                            setMaterialId(e.target.value);
                                            setMaterialFocus(undefined);
                                        }, disabled: materialsLoading || materials.length === 0, children: [_jsx("option", { value: "", children: "\u8BF7\u9009\u62E9\u8D44\u6599" }), materials.map((item) => (_jsx("option", { value: item.id, children: item.title }, item.id)))] }), _jsx("button", { onClick: () => void loadMaterials(), disabled: materialsLoading, children: materialsLoading ? "刷新中..." : "刷新资料列表" }), _jsx("button", { onClick: () => props.onNavigateToMaterials?.(), children: "\u53BB\u8D44\u6599\u9875\u7BA1\u7406" })] }), materialsError ? _jsxs("div", { className: "muted", children: ["\u8D44\u6599\u5217\u8868\u52A0\u8F7D\u5931\u8D25\uFF1A", materialsError] }) : null] }), !materialId ? (_jsxs("section", { className: "panel", style: { marginBottom: 14 }, children: [_jsx("h3", { children: "\u5F00\u59CB\u63D0\u95EE\u524D" }), _jsx("div", { className: "muted", children: "\u5F53\u524D\u6CA1\u6709\u53EF\u7528\u8D44\u6599\uFF0C\u8BF7\u5148\u5BFC\u5165\u8D44\u6599\uFF0C\u6216\u5728\u4E0A\u65B9\u9009\u62E9\u5DF2\u6709\u8D44\u6599\u3002" }), _jsx("div", { className: "toolbar", style: { marginTop: 10 }, children: _jsx("button", { className: "primary", onClick: () => props.onNavigateToMaterials?.(), children: "\u524D\u5F80\u8D44\u6599\u9875" }) })] })) : (_jsx(MaterialChatPanelContainer, { materialId: materialId, focusRequest: materialFocus, onOpenMaterialCitation: (payload) => {
                            props.onOpenMaterialCitation?.({
                                materialId: payload.materialId,
                                preferredContentKind: payload.level,
                                highlightSnippet: payload.snippet,
                            });
                        } }))] }))] }));
}
