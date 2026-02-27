import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function ChatCitationsPanel(props) {
    return (_jsxs("section", { className: "panel", children: [_jsx("h3", { children: "\u5F15\u7528\u7684\u6587\u6863" }), props.citations.length === 0 ? _jsx("div", { className: "muted", children: "\u6682\u65E0\u5F15\u7528\uFF0C\u7CFB\u7EDF\u6B63\u5728\u68C0\u7D22\u8D44\u6599" }) : null, props.citations.map((item) => (_jsxs("article", { className: "citation-item", children: [_jsx("div", { children: _jsx("strong", { children: item.materialTitle }) }), _jsxs("div", { className: "muted", children: ["\u5C42\u7EA7\uFF1A", item.level] }), _jsx("div", { children: item.snippet }), _jsx("div", { className: "toolbar", children: _jsx("button", { onClick: () => props.onOpenMaterial?.({
                                materialId: item.materialId,
                                level: item.level,
                                snippet: item.snippet,
                                anchor: item.anchor,
                            }), children: "\u6253\u5F00\u5E76\u5B9A\u4F4D" }) })] }, item.citationId))), props.candidates && props.candidates.length > 0 ? (_jsxs("details", { children: [_jsx("summary", { children: "\u5019\u9009\u8D44\u6599\uFF08\u8C03\u8BD5\u89C6\u56FE\uFF09" }), props.candidates.map((item) => (_jsxs("div", { className: "muted", children: [item.title, " - ", item.score.toFixed(3)] }, item.materialId)))] })) : null] }));
}
