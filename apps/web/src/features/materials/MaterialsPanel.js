import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { MaterialChatPanelContainer } from "../chat/containers/MaterialChatPanelContainer";
import { buildApiUrl, describeApiBaseUrl } from "../../shared/api/baseUrl";
import { requestJson } from "../../shared/api/httpClient";
export function MaterialsPanel(props) {
    const [sourceUrl, setSourceUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [materials, setMaterials] = useState([]);
    const [selectedMaterialId, setSelectedMaterialId] = useState(null);
    const [contentKind, setContentKind] = useState("original");
    const [detail, setDetail] = useState(null);
    const [detailError, setDetailError] = useState("");
    const [content, setContent] = useState("");
    const [contentError, setContentError] = useState("");
    const [highlightSnippet, setHighlightSnippet] = useState("");
    const [highlightToken, setHighlightToken] = useState(0);
    const highlightRef = useRef(null);
    const loadMaterials = async () => {
        try {
            const data = await requestJson("/api/materials?page=1&pageSize=50", { method: "GET" });
            setMaterials(data.items);
        }
        catch {
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
                const detailJson = await requestJson(`/api/materials/${selectedMaterialId}`, {
                    method: "GET",
                });
                setDetail(detailJson);
                setDetailError("");
            }
            catch (error) {
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
                const json = await requestJson(`/api/materials/${selectedMaterialId}/content?kind=${contentKind}`, { method: "GET" });
                setContent(json.content);
                setContentError("");
            }
            catch (error) {
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
        }
        else {
            setHighlightSnippet("");
            setHighlightToken(0);
        }
    }, [props.focusRequest?.token]);
    return (_jsxs("section", { id: props.sectionId, className: "panel", style: { marginBottom: 14 }, children: [_jsx("h3", { children: "\u8D44\u6599\u5BFC\u5165\u4E0E\u67E5\u770B" }), _jsxs("div", { className: "toolbar", children: [_jsx("input", { style: { minWidth: 420 }, placeholder: "\u8F93\u5165\u7F51\u9875 URL", value: sourceUrl, onChange: (e) => setSourceUrl(e.target.value) }), _jsx("button", { className: "primary", disabled: loading || !sourceUrl.trim(), onClick: async () => {
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
                                const json = (await resp.json());
                                if (json.code === "MATERIAL_DUPLICATE" && json.data?.materialId) {
                                    setSelectedMaterialId(json.data.materialId);
                                    setHighlightSnippet("");
                                    setHighlightToken(0);
                                    await loadMaterials();
                                }
                                else if (json.code !== "OK") {
                                    window.alert(json.message || "导入资料失败");
                                }
                                else {
                                    setSelectedMaterialId(json.data.materialId);
                                    setHighlightSnippet("");
                                    setHighlightToken(0);
                                    setSourceUrl("");
                                    await loadMaterials();
                                }
                            }
                            catch (error) {
                                const msg = error instanceof Error ? error.message : "导入资料失败";
                                window.alert(`导入资料失败：${msg}。接口基址：${describeApiBaseUrl()}`);
                            }
                            finally {
                                setLoading(false);
                            }
                        }, children: loading ? "导入中..." : "导入资料" })] }), _jsxs("div", { className: "toolbar", children: [_jsxs("select", { value: selectedMaterialId ?? "", onChange: (e) => {
                            setSelectedMaterialId(e.target.value || null);
                            setHighlightSnippet("");
                            setHighlightToken(0);
                        }, children: [_jsx("option", { value: "", children: "\u9009\u62E9\u8D44\u6599" }), materials.map((item) => (_jsx("option", { value: item.id, children: item.title }, item.id)))] }), _jsxs("select", { value: contentKind, onChange: (e) => {
                            setContentKind(e.target.value);
                            setHighlightSnippet("");
                            setHighlightToken(0);
                        }, disabled: !selectedMaterialId, children: [_jsx("option", { value: "original", children: "\u539F\u6587" }), _jsx("option", { value: "brief_summary", children: "\u7CBE\u7B80\u603B\u7ED3" }), _jsx("option", { value: "detailed_notes", children: "\u8BE6\u7EC6\u6574\u7406" })] }), _jsx("button", { onClick: () => void loadMaterials(), children: "\u5237\u65B0\u5217\u8868" })] }), _jsxs("section", { className: "panel", style: { borderStyle: "dashed", marginBottom: 14 }, children: [_jsx("h3", { children: "\u8D44\u6599\u8BE6\u60C5" }), !selectedMaterialId ? _jsx("div", { className: "muted", children: "\u8BF7\u9009\u62E9\u8D44\u6599\u540E\u67E5\u770B\u8BE6\u60C5" }) : null, selectedMaterialId && detailError ? _jsxs("div", { className: "muted", children: ["\u8BE6\u60C5\u8BFB\u53D6\u5931\u8D25\uFF1A", detailError] }) : null, selectedMaterialId && detail ? (_jsxs("div", { className: "material-meta-grid", children: [_jsxs("div", { children: [_jsxs("div", { children: [_jsx("strong", { children: "\u6807\u9898\uFF1A" }), detail.title] }), _jsxs("div", { className: "muted", children: ["\u8D44\u6599ID\uFF1A", detail.id] }), _jsxs("div", { className: "muted", children: ["\u6765\u6E90\u7C7B\u578B\uFF1A", detail.sourceType] }), _jsxs("div", { className: "muted", children: ["\u72B6\u6001\uFF1A", detail.status] }), _jsxs("div", { className: "muted", children: ["\u6293\u53D6\u9636\u6BB5\uFF1A", detail.ingestStage] })] }), _jsxs("div", { children: [_jsxs("div", { className: "muted", children: ["\u7CBE\u7B80\u603B\u7ED3\uFF1A", detail.briefSummaryStatus] }), _jsxs("div", { className: "muted", children: ["\u8BE6\u7EC6\u6574\u7406\uFF1A", detail.detailedNotesStatus] }), _jsxs("div", { className: "muted", children: ["\u5206\u7C7B\u5EFA\u8BAE\uFF1A", detail.classifyStatus] }), _jsxs("div", { className: "muted", children: ["\u521B\u5EFA\u65F6\u95F4\uFF1A", detail.createdAt] }), _jsxs("div", { className: "muted", children: ["\u66F4\u65B0\u65F6\u95F4\uFF1A", detail.updatedAt] })] }), _jsxs("div", { children: [_jsx("div", { className: "muted", children: "\u5206\u7C7B\u8DEF\u5F84\uFF1A" }), _jsx("div", { children: detail.categories.length > 0 ? detail.categories.map((x) => x.path).join(" / ") : "未绑定分类" }), _jsxs("div", { className: "muted", style: { marginTop: 6 }, children: ["\u539F\u59CB\u94FE\u63A5\uFF1A", detail.originalUrl] })] })] })) : null] }), _jsxs("section", { className: "panel", style: { borderStyle: "dashed", marginBottom: 14 }, children: [_jsx("h3", { children: "\u8D44\u6599\u5185\u5BB9" }), contentError ? _jsxs("div", { className: "muted", children: ["\u5185\u5BB9\u8BFB\u53D6\u5931\u8D25\uFF1A", contentError] }) : null, highlightSnippet ? (_jsx("div", { className: "muted", style: { marginBottom: 8 }, children: highlightRange ? "已定位到引用片段" : "未匹配到精确片段，已打开对应内容层级" })) : null, _jsxs("article", { className: "answer-box", children: [!content ? "请选择资料查看内容" : null, content && highlightRange
                                ? (_jsxs(_Fragment, { children: [content.slice(0, highlightRange.start), _jsx("mark", { ref: highlightRef, children: content.slice(highlightRange.start, highlightRange.end) }), content.slice(highlightRange.end)] }))
                                : content] })] }), selectedMaterialId ? (_jsx(MaterialChatPanelContainer, { materialId: selectedMaterialId, onOpenMaterialCitation: (payload) => {
                    if (payload.materialId !== selectedMaterialId) {
                        setSelectedMaterialId(payload.materialId);
                    }
                    setContentKind(payload.level);
                    setHighlightSnippet(payload.snippet.trim());
                    setHighlightToken((x) => x + 1);
                }, focusRequest: props.focusRequest && props.focusRequest.materialId === selectedMaterialId
                    ? {
                        threadId: props.focusRequest.threadId,
                        token: props.focusRequest.token,
                    }
                    : undefined })) : null] }));
}
function findSnippetRange(content, snippet) {
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
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
