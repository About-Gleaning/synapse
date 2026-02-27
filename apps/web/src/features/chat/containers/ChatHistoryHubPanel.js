import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { listThreads } from "../api/chatApi";
export function ChatHistoryHubPanel(props) {
    const [scopeFilter, setScopeFilter] = useState("all");
    const [keywordInput, setKeywordInput] = useState("");
    const [keyword, setKeyword] = useState("");
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [data, setData] = useState({
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
            }
            catch (err) {
                if (!active) {
                    return;
                }
                setError(err instanceof Error ? err.message : "会话检索失败");
            }
            finally {
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
    return (_jsxs("section", { className: "panel", style: { marginBottom: 14 }, children: [_jsx("h3", { children: "\u4F1A\u8BDD\u5386\u53F2\u7EDF\u4E00\u5165\u53E3" }), _jsxs("div", { className: "history-hub-toolbar", children: [_jsxs("select", { value: scopeFilter, onChange: (e) => {
                            setScopeFilter(e.target.value);
                            setPage(1);
                        }, children: [_jsx("option", { value: "all", children: "\u5168\u90E8\u8303\u56F4" }), _jsx("option", { value: "global", children: "\u4EC5\u5168\u5C40\u4F1A\u8BDD" }), _jsx("option", { value: "material", children: "\u4EC5\u5355\u8D44\u6599\u4F1A\u8BDD" })] }), _jsx("input", { placeholder: "\u68C0\u7D22\u6807\u9898/\u7EBF\u7A0BID/\u8D44\u6599\u6807\u9898", value: keywordInput, onChange: (e) => setKeywordInput(e.target.value), onKeyDown: (e) => {
                            if (e.key === "Enter") {
                                setKeyword(keywordInput.trim());
                                setPage(1);
                            }
                        } }), _jsx("button", { onClick: () => {
                            setKeyword(keywordInput.trim());
                            setPage(1);
                        }, children: "\u68C0\u7D22" }), _jsx("button", { onClick: () => {
                            setKeywordInput("");
                            setKeyword("");
                            setScopeFilter("all");
                            setPage(1);
                        }, children: "\u91CD\u7F6E" })] }), _jsxs("div", { className: "toolbar", children: [_jsxs("span", { className: "muted", children: ["\u5171 ", data.total, " \u6761\u7EBF\u7A0B\uFF0C\u5F53\u524D\u7B2C ", data.page, "/", totalPages, " \u9875"] }), loading ? _jsx("span", { className: "muted", children: "\u52A0\u8F7D\u4E2D..." }) : null] }), error ? _jsxs("div", { className: "muted", children: ["\u68C0\u7D22\u5931\u8D25\uFF1A", error] }) : null, !loading && data.items.length === 0 ? _jsx("div", { className: "muted", children: "\u6682\u65E0\u5339\u914D\u4F1A\u8BDD" }) : null, data.items.map((item) => (_jsxs("article", { className: "history-hub-item", children: [_jsxs("div", { className: "history-hub-main", children: [_jsx("strong", { children: item.title }), _jsxs("div", { className: "muted", children: ["\u8303\u56F4\uFF1A", item.scopeType === "global" ? "全局会话" : "单资料会话", item.scopeType === "material" ? `（${item.scopeTitle || item.scopeId || "未知资料"}）` : ""] }), _jsxs("div", { className: "muted", children: ["\u6D88\u606F\u6570\uFF1A", item.messageCount, "\uFF0C\u6700\u8FD1\u6D88\u606F\uFF1A", item.lastMessageAt || "暂无"] }), _jsxs("div", { className: "muted", children: ["\u7EBF\u7A0BID\uFF1A", item.id] })] }), _jsx("div", { children: _jsx("button", { onClick: () => {
                                if (item.scopeType === "global") {
                                    props.onOpenGlobalThread(item.id);
                                    return;
                                }
                                if (item.scopeId) {
                                    props.onOpenMaterialThread(item.scopeId, item.id);
                                }
                            }, disabled: item.scopeType === "material" && !item.scopeId, children: "\u6253\u5F00\u4F1A\u8BDD" }) })] }, item.id))), _jsxs("div", { className: "toolbar", style: { marginBottom: 0 }, children: [_jsx("button", { disabled: page <= 1, onClick: () => setPage((x) => Math.max(1, x - 1)), children: "\u4E0A\u4E00\u9875" }), _jsx("button", { disabled: page >= totalPages, onClick: () => setPage((x) => Math.min(totalPages, x + 1)), children: "\u4E0B\u4E00\u9875" })] })] }));
}
