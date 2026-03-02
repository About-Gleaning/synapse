import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildApiUrl, describeApiBaseUrl } from "../../shared/api/baseUrl";
import { requestJson } from "../../shared/api/httpClient";
const UNCATEGORIZED_NODE_ID = "__uncategorized__";
const MAX_SUMMARY_ITEMS = 8;
const MAX_SUMMARY_TEXT_LENGTH = 1200;
export function MaterialsPanel(props) {
    const [sourceUrl, setSourceUrl] = useState("");
    const [importLoading, setImportLoading] = useState(false);
    const [materials, setMaterials] = useState([]);
    const [materialsLoading, setMaterialsLoading] = useState(false);
    const [categoryTree, setCategoryTree] = useState({ nodes: [] });
    const [treeLoading, setTreeLoading] = useState(false);
    const [treeError, setTreeError] = useState("");
    const [selection, setSelection] = useState({ type: "uncategorized" });
    const [expandedCategoryIds, setExpandedCategoryIds] = useState([]);
    const [uncategorizedExpanded, setUncategorizedExpanded] = useState(true);
    const [categoryMaterialsMap, setCategoryMaterialsMap] = useState({});
    const [categoryMaterialsLoadingMap, setCategoryMaterialsLoadingMap] = useState({});
    const [categoryMaterialsErrorMap, setCategoryMaterialsErrorMap] = useState({});
    const [detailInfoOpen, setDetailInfoOpen] = useState(false);
    const [detail, setDetail] = useState(null);
    const [detailError, setDetailError] = useState("");
    const [summaryContent, setSummaryContent] = useState("");
    const [summaryError, setSummaryError] = useState("");
    const [detailViewKind, setDetailViewKind] = useState("detailed_notes");
    const [detailContent, setDetailContent] = useState("");
    const [detailContentError, setDetailContentError] = useState("");
    const [highlightSnippet, setHighlightSnippet] = useState("");
    const [highlightToken, setHighlightToken] = useState(0);
    const summaryHighlightRef = useRef(null);
    const detailHighlightRef = useRef(null);
    const selectedMaterialId = selection.type === "material" ? selection.materialId : null;
    const selectedCategoryId = selection.type === "category" ? selection.categoryId : null;
    const allCategoryIds = useMemo(() => collectCategoryIds(categoryTree.nodes), [categoryTree.nodes]);
    const categoryMap = useMemo(() => {
        const map = new Map();
        for (const node of flattenCategoryTree(categoryTree.nodes)) {
            map.set(node.id, node);
        }
        return map;
    }, [categoryTree.nodes]);
    const uncategorizedMaterials = useMemo(() => materials.filter((item) => item.categoryPaths.length === 0), [materials]);
    const selectedCategoryMaterials = useMemo(() => {
        if (!selectedCategoryId) {
            return [];
        }
        return categoryMaterialsMap[selectedCategoryId] ?? [];
    }, [selectedCategoryId, categoryMaterialsMap]);
    const selectedMaterialTitle = useMemo(() => {
        if (!selectedMaterialId) {
            return "";
        }
        const detailTitle = detail?.title?.trim() ?? "";
        if (detailTitle) {
            return detailTitle;
        }
        const listHit = materials.find((item) => item.id === selectedMaterialId);
        if (listHit?.title?.trim()) {
            return listHit.title.trim();
        }
        for (const items of Object.values(categoryMaterialsMap)) {
            const categoryHit = items.find((item) => item.id === selectedMaterialId);
            if (categoryHit?.title?.trim()) {
                return categoryHit.title.trim();
            }
        }
        return "";
    }, [selectedMaterialId, detail?.title, materials, categoryMaterialsMap]);
    const canNavigateToChatWithMention = !!props.onNavigateToChatWithMention && !!selectedMaterialId && !!selectedMaterialTitle;
    const isSelectedCategoryLoading = selectedCategoryId ? !!categoryMaterialsLoadingMap[selectedCategoryId] : false;
    const selectedCategoryError = selectedCategoryId ? categoryMaterialsErrorMap[selectedCategoryId] ?? "" : "";
    const selectedCategoryTitle = selectedCategoryId ? categoryMap.get(selectedCategoryId)?.path ?? "未命名分类" : "";
    const summaryHighlightRange = useMemo(() => {
        return findSnippetRange(summaryContent, highlightSnippet);
    }, [summaryContent, highlightSnippet, highlightToken]);
    const detailHighlightRange = useMemo(() => {
        return findSnippetRange(detailContent, highlightSnippet);
    }, [detailContent, highlightSnippet, highlightToken]);
    const categorySummaryText = useMemo(() => {
        if (!selectedCategoryId) {
            return "";
        }
        return buildCategorySummary(selectedCategoryTitle, selectedCategoryMaterials);
    }, [selectedCategoryId, selectedCategoryMaterials, selectedCategoryTitle]);
    const uncategorizedSummaryText = useMemo(() => {
        if (selection.type !== "uncategorized") {
            return "";
        }
        return buildCategorySummary("未分类", uncategorizedMaterials);
    }, [selection.type, uncategorizedMaterials]);
    async function loadMaterials() {
        setMaterialsLoading(true);
        try {
            const data = await requestJson("/api/materials?page=1&pageSize=100", { method: "GET" });
            setMaterials(data.items);
        }
        catch {
            setMaterials([]);
        }
        finally {
            setMaterialsLoading(false);
        }
    }
    async function loadCategoryTree() {
        setTreeLoading(true);
        setTreeError("");
        try {
            const data = await requestJson("/api/categories/tree", { method: "GET" });
            setCategoryTree(data);
            if (expandedCategoryIds.length === 0) {
                setExpandedCategoryIds(data.nodes.map((item) => item.id));
            }
        }
        catch (error) {
            setTreeError(error instanceof Error ? error.message : "分类树读取失败");
            setCategoryTree({ nodes: [] });
        }
        finally {
            setTreeLoading(false);
        }
    }
    async function loadCategoryMaterials(categoryId, force = false) {
        if (!force && categoryMaterialsMap[categoryId]) {
            return;
        }
        setCategoryMaterialsLoadingMap((prev) => ({ ...prev, [categoryId]: true }));
        setCategoryMaterialsErrorMap((prev) => ({ ...prev, [categoryId]: "" }));
        try {
            const data = await requestJson(`/api/materials?page=1&pageSize=100&categoryId=${encodeURIComponent(categoryId)}`, { method: "GET" });
            setCategoryMaterialsMap((prev) => ({
                ...prev,
                [categoryId]: dedupeMaterialsById(data.items),
            }));
        }
        catch (error) {
            setCategoryMaterialsMap((prev) => ({ ...prev, [categoryId]: [] }));
            setCategoryMaterialsErrorMap((prev) => ({
                ...prev,
                [categoryId]: error instanceof Error ? error.message : "分类资料读取失败",
            }));
        }
        finally {
            setCategoryMaterialsLoadingMap((prev) => ({ ...prev, [categoryId]: false }));
        }
    }
    useEffect(() => {
        void (async () => {
            await Promise.all([loadMaterials(), loadCategoryTree()]);
        })();
    }, []);
    useEffect(() => {
        if (selection.type === "category") {
            void loadCategoryMaterials(selection.categoryId);
        }
    }, [selection.type, selection.type === "category" ? selection.categoryId : ""]);
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
            setSummaryContent("");
            setSummaryError("");
            return;
        }
        void (async () => {
            try {
                const json = await requestJson(`/api/materials/${selectedMaterialId}/content?kind=brief_summary`, { method: "GET" });
                setSummaryContent(json.content);
                setSummaryError("");
            }
            catch (error) {
                setSummaryContent("");
                setSummaryError(error instanceof Error ? error.message : "精简总结读取失败");
            }
        })();
    }, [selectedMaterialId]);
    useEffect(() => {
        if (!selectedMaterialId) {
            setDetailContent("");
            setDetailContentError("");
            return;
        }
        const contentKind = detailViewKind === "original" ? "original" : "detailed_notes";
        void (async () => {
            try {
                const json = await requestJson(`/api/materials/${selectedMaterialId}/content?kind=${contentKind}`, { method: "GET" });
                setDetailContent(json.content);
                setDetailContentError("");
            }
            catch (error) {
                setDetailContent("");
                setDetailContentError(error instanceof Error ? error.message : "内容读取失败");
            }
        })();
    }, [selectedMaterialId, detailViewKind]);
    useEffect(() => {
        const hasDetailHighlight = !!detailHighlightRange && !!detailHighlightRef.current;
        const hasSummaryHighlight = !!summaryHighlightRange && !!summaryHighlightRef.current;
        if (hasDetailHighlight) {
            detailHighlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }
        if (hasSummaryHighlight) {
            summaryHighlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, [summaryHighlightRange?.start, detailHighlightRange?.start, selectedMaterialId, detailViewKind]);
    useEffect(() => {
        if (!props.focusRequest) {
            return;
        }
        if (props.focusRequest.materialId) {
            setSelection({
                type: "material",
                materialId: props.focusRequest.materialId,
            });
        }
        if (props.focusRequest.preferredContentKind === "original") {
            setDetailViewKind("original");
        }
        else {
            setDetailViewKind("detailed_notes");
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
    useEffect(() => {
        if (selection.type === "category" && !allCategoryIds.includes(selection.categoryId)) {
            setSelection({ type: "uncategorized" });
        }
    }, [selection.type, selection.type === "category" ? selection.categoryId : "", allCategoryIds]);
    const onToggleCategoryExpand = (categoryId) => {
        const expanded = expandedCategoryIds.includes(categoryId);
        if (expanded) {
            setExpandedCategoryIds((prev) => prev.filter((id) => id !== categoryId));
            return;
        }
        setExpandedCategoryIds((prev) => [...prev, categoryId]);
        void loadCategoryMaterials(categoryId);
    };
    const onSelectCategory = (categoryId) => {
        setSelection({ type: "category", categoryId });
        if (!expandedCategoryIds.includes(categoryId)) {
            setExpandedCategoryIds((prev) => [...prev, categoryId]);
        }
        setHighlightSnippet("");
        setHighlightToken(0);
        void loadCategoryMaterials(categoryId);
    };
    const onSelectMaterial = (materialId, fromCategoryId) => {
        setSelection({ type: "material", materialId, fromCategoryId });
        setDetailViewKind("detailed_notes");
        setHighlightSnippet("");
        setHighlightToken(0);
    };
    const onSelectUncategorized = () => {
        setSelection({ type: "uncategorized" });
        setHighlightSnippet("");
        setHighlightToken(0);
    };
    const renderTree = (nodes, depth = 0) => {
        return nodes.map((node) => {
            const expanded = expandedCategoryIds.includes(node.id);
            const isActive = selection.type === "category" && selection.categoryId === node.id;
            const materialsUnderCategory = categoryMaterialsMap[node.id] ?? [];
            const loading = !!categoryMaterialsLoadingMap[node.id];
            const errorText = categoryMaterialsErrorMap[node.id] ?? "";
            return (_jsxs("div", { className: "materials-tree-node-group", children: [_jsxs("div", { className: `materials-tree-category-row ${isActive ? "active" : ""}`, style: { paddingLeft: `${8 + depth * 16}px` }, children: [_jsx("button", { type: "button", className: "materials-tree-expand-btn", onClick: () => onToggleCategoryExpand(node.id), "aria-label": expanded ? "收起分类" : "展开分类", children: expanded ? "-" : "+" }), _jsx("button", { type: "button", className: "materials-tree-category-btn", onClick: () => onSelectCategory(node.id), children: node.name })] }), expanded ? (_jsxs("div", { className: "materials-tree-children-wrap", children: [renderTree(node.children, depth + 1), loading ? _jsx("div", { className: "materials-tree-hint", style: { paddingLeft: `${26 + depth * 16}px` }, children: "\u8D44\u6599\u52A0\u8F7D\u4E2D..." }) : null, errorText ? (_jsxs("div", { className: "materials-tree-hint", style: { paddingLeft: `${26 + depth * 16}px` }, children: ["\u8D44\u6599\u8BFB\u53D6\u5931\u8D25\uFF1A", errorText] })) : null, !loading && !errorText && materialsUnderCategory.length === 0 ? (_jsx("div", { className: "materials-tree-hint", style: { paddingLeft: `${26 + depth * 16}px` }, children: "\u6682\u65E0\u8D44\u6599" })) : null, !loading && !errorText
                                ? materialsUnderCategory.map((item) => {
                                    const leafActive = selection.type === "material" && selection.materialId === item.id;
                                    return (_jsx("button", { type: "button", className: `materials-tree-leaf-btn ${leafActive ? "active" : ""}`, style: { paddingLeft: `${26 + depth * 16}px` }, onClick: () => onSelectMaterial(item.id, node.id), children: item.title }, `${node.id}-${item.id}`));
                                })
                                : null] })) : null] }, node.id));
        });
    };
    const renderSummaryPanel = () => {
        if (selection.type === "material") {
            return (_jsxs(_Fragment, { children: [summaryError ? _jsxs("div", { className: "muted", children: ["\u7CBE\u7B80\u603B\u7ED3\u8BFB\u53D6\u5931\u8D25\uFF1A", summaryError] }) : null, highlightSnippet ? (_jsx("div", { className: "muted", style: { marginBottom: 8 }, children: summaryHighlightRange || detailHighlightRange ? "已定位到引用片段" : "未匹配到精确片段" })) : null, _jsxs("article", { className: "answer-box answer-box-plain materials-content-box", children: [!summaryContent ? "当前资料暂无精简总结" : null, summaryContent && summaryHighlightRange
                                ? (_jsxs(_Fragment, { children: [summaryContent.slice(0, summaryHighlightRange.start), _jsx("mark", { ref: summaryHighlightRef, children: summaryContent.slice(summaryHighlightRange.start, summaryHighlightRange.end) }), summaryContent.slice(summaryHighlightRange.end)] }))
                                : summaryContent] })] }));
        }
        const text = selection.type === "category" ? categorySummaryText : uncategorizedSummaryText;
        return _jsx("article", { className: "answer-box answer-box-plain materials-content-box", children: text || "暂无可展示的精简总结" });
    };
    const renderDetailPanel = () => {
        if (selection.type === "material") {
            return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "materials-detail-subtoolbar", children: [_jsxs("span", { className: "muted", children: ["\u5F53\u524D\u89C6\u56FE\uFF1A", detailViewKind === "original" ? "原文" : "详细整理"] }), _jsx("button", { type: "button", disabled: detailViewKind === "detailed_notes", onClick: () => setDetailViewKind("detailed_notes"), children: "\u67E5\u770B\u8BE6\u7EC6\u6574\u7406" })] }), detailContentError ? _jsxs("div", { className: "muted", children: ["\u5185\u5BB9\u8BFB\u53D6\u5931\u8D25\uFF1A", detailContentError] }) : null, _jsxs("article", { className: "answer-box answer-box-plain materials-content-box", children: [!detailContent ? (detailViewKind === "original" ? "当前资料暂无原文" : "当前资料暂无详细整理") : null, detailContent && detailHighlightRange
                                ? (_jsxs(_Fragment, { children: [detailContent.slice(0, detailHighlightRange.start), _jsx("mark", { ref: detailHighlightRef, children: detailContent.slice(detailHighlightRange.start, detailHighlightRange.end) }), detailContent.slice(detailHighlightRange.end)] }))
                                : detailContent] })] }));
        }
        if (selection.type === "category") {
            return (_jsxs("div", { className: "materials-category-list", children: [isSelectedCategoryLoading ? _jsx("div", { className: "muted", children: "\u5206\u7C7B\u8D44\u6599\u52A0\u8F7D\u4E2D..." }) : null, selectedCategoryError ? _jsxs("div", { className: "muted", children: ["\u5206\u7C7B\u8D44\u6599\u8BFB\u53D6\u5931\u8D25\uFF1A", selectedCategoryError] }) : null, !isSelectedCategoryLoading && !selectedCategoryError && selectedCategoryMaterials.length === 0 ? (_jsx("div", { className: "muted", children: "\u8BE5\u5206\u7C7B\u4E0B\u6682\u65E0\u8D44\u6599" })) : null, !isSelectedCategoryLoading && !selectedCategoryError
                        ? selectedCategoryMaterials.map((item) => (_jsxs("button", { type: "button", className: "materials-category-item", onClick: () => onSelectMaterial(item.id, selectedCategoryId ?? undefined), children: [_jsx("div", { className: "materials-category-item-title", children: item.title }), _jsxs("div", { className: "materials-category-item-meta", children: ["\u72B6\u6001\uFF1A", item.status, " | \u66F4\u65B0\u65F6\u95F4\uFF1A", item.updatedAt] })] }, item.id)))
                        : null] }));
        }
        return (_jsxs("div", { className: "materials-category-list", children: [uncategorizedMaterials.length === 0 ? _jsx("div", { className: "muted", children: "\u6682\u65E0\u672A\u5206\u7C7B\u8D44\u6599" }) : null, uncategorizedMaterials.map((item) => (_jsxs("button", { type: "button", className: "materials-category-item", onClick: () => onSelectMaterial(item.id), children: [_jsx("div", { className: "materials-category-item-title", children: item.title }), _jsxs("div", { className: "materials-category-item-meta", children: ["\u72B6\u6001\uFF1A", item.status, " | \u66F4\u65B0\u65F6\u95F4\uFF1A", item.updatedAt] })] }, item.id)))] }));
    };
    return (_jsxs("section", { id: props.sectionId, className: "panel", style: { marginBottom: 14 }, children: [_jsx("h3", { children: "\u8D44\u6599\u5DE5\u4F5C\u53F0" }), _jsxs("div", { className: "materials-workspace-shell", children: [_jsxs("aside", { className: "materials-tree-panel", children: [_jsxs("div", { className: "materials-tree-toolbar", children: [_jsx("strong", { children: "\u8D44\u6599\u5206\u7C7B" }), _jsx("button", { type: "button", onClick: () => {
                                            void loadCategoryTree();
                                            void loadMaterials();
                                        }, disabled: treeLoading || materialsLoading, children: treeLoading || materialsLoading ? "刷新中..." : "刷新" })] }), treeError ? _jsxs("div", { className: "materials-tree-hint", children: ["\u5206\u7C7B\u6811\u8BFB\u53D6\u5931\u8D25\uFF1A", treeError] }) : null, _jsxs("div", { className: "materials-tree-scroll", children: [categoryTree.nodes.length === 0 ? _jsx("div", { className: "materials-tree-hint", children: "\u6682\u65E0\u5206\u7C7B" }) : null, renderTree(categoryTree.nodes), _jsxs("div", { className: `materials-tree-category-row ${selection.type === "uncategorized" ? "active" : ""}`, children: [_jsx("button", { type: "button", className: "materials-tree-expand-btn", onClick: () => setUncategorizedExpanded((prev) => !prev), "aria-label": uncategorizedExpanded ? "收起未分类" : "展开未分类", children: uncategorizedExpanded ? "-" : "+" }), _jsx("button", { type: "button", className: "materials-tree-category-btn", onClick: onSelectUncategorized, children: "\u672A\u5206\u7C7B" })] }), uncategorizedExpanded
                                        ? uncategorizedMaterials.map((item) => {
                                            const leafActive = selection.type === "material" && selection.materialId === item.id;
                                            return (_jsx("button", { type: "button", className: `materials-tree-leaf-btn ${leafActive ? "active" : ""}`, style: { paddingLeft: "24px" }, onClick: () => onSelectMaterial(item.id), children: item.title }, `${UNCATEGORIZED_NODE_ID}-${item.id}`));
                                        })
                                        : null] })] }), _jsxs("section", { className: "materials-main-panel", children: [_jsxs("div", { className: "materials-actions", children: [_jsx("button", { type: "button", onClick: () => {
                                            if (!selectedMaterialId) {
                                                window.alert("请先选择资料再查看详情");
                                                return;
                                            }
                                            setDetailInfoOpen(true);
                                        }, disabled: !selectedMaterialId, children: "\u67E5\u770B\u8BE6\u7EC6\u4FE1\u606F" }), _jsx("button", { type: "button", disabled: !canNavigateToChatWithMention, onClick: () => {
                                            if (!selectedMaterialId || !selectedMaterialTitle) {
                                                return;
                                            }
                                            props.onNavigateToChatWithMention?.({
                                                materialId: selectedMaterialId,
                                                materialTitle: selectedMaterialTitle,
                                                forceNewThread: true,
                                            });
                                        }, children: "\u53BB\u9996\u9875\u95EE\u7B54" }), _jsx("button", { type: "button", disabled: !selectedMaterialId, onClick: () => setDetailViewKind("original"), children: "\u67E5\u770B\u539F\u6587" }), _jsx("input", { className: "materials-import-input", placeholder: "\u8F93\u5165\u7F51\u9875 URL", value: sourceUrl, onChange: (e) => setSourceUrl(e.target.value) }), _jsx("button", { type: "button", className: "primary", disabled: importLoading || !sourceUrl.trim(), onClick: async () => {
                                            setImportLoading(true);
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
                                                    setSelection({ type: "material", materialId: json.data.materialId });
                                                    setDetailViewKind("detailed_notes");
                                                    setSourceUrl("");
                                                    setHighlightSnippet("");
                                                    setHighlightToken(0);
                                                    await Promise.all([loadMaterials(), loadCategoryTree()]);
                                                }
                                                else if (json.code !== "OK") {
                                                    window.alert(json.message || "导入资料失败");
                                                }
                                                else {
                                                    setSelection({ type: "material", materialId: json.data.materialId });
                                                    setDetailViewKind("detailed_notes");
                                                    setSourceUrl("");
                                                    setHighlightSnippet("");
                                                    setHighlightToken(0);
                                                    await Promise.all([loadMaterials(), loadCategoryTree()]);
                                                }
                                            }
                                            catch (error) {
                                                const msg = error instanceof Error ? error.message : "导入资料失败";
                                                window.alert(`导入资料失败：${msg}。接口基址：${describeApiBaseUrl()}`);
                                            }
                                            finally {
                                                setImportLoading(false);
                                            }
                                        }, children: importLoading ? "导入中..." : "导入资料" })] }), _jsxs("section", { className: "panel materials-summary-panel", children: [_jsx("h3", { children: "\u7CBE\u7B80\u603B\u7ED3" }), renderSummaryPanel()] }), _jsxs("section", { className: "panel materials-detail-panel", children: [_jsx("h3", { children: selection.type === "material" ? "详细整理" : "资料列表" }), renderDetailPanel()] })] })] }), detailInfoOpen ? (_jsx("div", { className: "materials-detail-drawer-backdrop", onClick: () => setDetailInfoOpen(false), children: _jsxs("section", { className: "materials-detail-drawer", onClick: (e) => {
                        e.stopPropagation();
                    }, children: [_jsxs("div", { className: "materials-drawer-header", children: [_jsx("h3", { children: "\u8D44\u6599\u8BE6\u7EC6\u4FE1\u606F" }), _jsx("button", { type: "button", onClick: () => setDetailInfoOpen(false), children: "\u5173\u95ED" })] }), !selectedMaterialId ? _jsx("div", { className: "muted", children: "\u8BF7\u5148\u9009\u62E9\u8D44\u6599" }) : null, selectedMaterialId && detailError ? _jsxs("div", { className: "muted", children: ["\u8BE6\u60C5\u8BFB\u53D6\u5931\u8D25\uFF1A", detailError] }) : null, selectedMaterialId && detail ? (_jsxs("div", { className: "material-meta-grid", children: [_jsxs("div", { children: [_jsxs("div", { children: [_jsx("strong", { children: "\u6807\u9898\uFF1A" }), detail.title] }), _jsxs("div", { className: "muted", children: ["\u8D44\u6599ID\uFF1A", detail.id] }), _jsxs("div", { className: "muted", children: ["\u6765\u6E90\u7C7B\u578B\uFF1A", detail.sourceType] }), _jsxs("div", { className: "muted", children: ["\u72B6\u6001\uFF1A", detail.status] }), _jsxs("div", { className: "muted", children: ["\u6293\u53D6\u9636\u6BB5\uFF1A", detail.ingestStage] })] }), _jsxs("div", { children: [_jsxs("div", { className: "muted", children: ["\u7CBE\u7B80\u603B\u7ED3\uFF1A", detail.briefSummaryStatus] }), _jsxs("div", { className: "muted", children: ["\u8BE6\u7EC6\u6574\u7406\uFF1A", detail.detailedNotesStatus] }), _jsxs("div", { className: "muted", children: ["\u5206\u7C7B\u5EFA\u8BAE\uFF1A", detail.classifyStatus] }), _jsxs("div", { className: "muted", children: ["\u521B\u5EFA\u65F6\u95F4\uFF1A", detail.createdAt] }), _jsxs("div", { className: "muted", children: ["\u66F4\u65B0\u65F6\u95F4\uFF1A", detail.updatedAt] })] }), _jsxs("div", { children: [_jsx("div", { className: "muted", children: "\u5206\u7C7B\u8DEF\u5F84\uFF1A" }), _jsx("div", { children: detail.categories.length > 0 ? detail.categories.map((x) => x.path).join(" / ") : "未绑定分类" }), _jsxs("div", { className: "muted", style: { marginTop: 6 }, children: ["\u539F\u59CB\u94FE\u63A5\uFF1A", detail.originalUrl] })] })] })) : null] }) })) : null] }));
}
function flattenCategoryTree(nodes) {
    const result = [];
    for (const node of nodes) {
        result.push(node);
        result.push(...flattenCategoryTree(node.children));
    }
    return result;
}
function collectCategoryIds(nodes) {
    return flattenCategoryTree(nodes).map((node) => node.id);
}
function dedupeMaterialsById(items) {
    const map = new Map();
    for (const item of items) {
        if (!map.has(item.id)) {
            map.set(item.id, item);
        }
    }
    return Array.from(map.values());
}
function buildCategorySummary(categoryName, items) {
    if (items.length === 0) {
        return `分类「${categoryName}」下暂无资料。`;
    }
    const header = `分类「${categoryName}」共有 ${items.length} 篇资料。以下是重点条目：`;
    const lines = items.slice(0, MAX_SUMMARY_ITEMS).map((item, index) => {
        const title = item.title.trim() || "未命名资料";
        return `${index + 1}. ${title}（状态：${item.status}，更新：${item.updatedAt}）`;
    });
    const text = `${header}\n${lines.join("\n")}`;
    if (text.length <= MAX_SUMMARY_TEXT_LENGTH) {
        return text;
    }
    return `${text.slice(0, MAX_SUMMARY_TEXT_LENGTH)}...`;
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
