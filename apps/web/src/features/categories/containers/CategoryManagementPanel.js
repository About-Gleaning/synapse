import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { bindMaterialCategories, createCategory, deleteCategory, getCategoryTree, getMaterialDetail, listMaterialsForBinding, moveCategory, updateCategory, } from "../api/categoryApi";
const ROOT_PARENT_VALUE = "__ROOT__";
export function CategoryManagementPanel() {
    const [tree, setTree] = useState({ nodes: [] });
    const [treeLoading, setTreeLoading] = useState(false);
    const [treeError, setTreeError] = useState("");
    const [selectedCategoryId, setSelectedCategoryId] = useState(null);
    const [createName, setCreateName] = useState("");
    const [createParentId, setCreateParentId] = useState(ROOT_PARENT_VALUE);
    const [createSortOrder, setCreateSortOrder] = useState("0");
    const [editName, setEditName] = useState("");
    const [editSortOrder, setEditSortOrder] = useState("0");
    const [moveParentId, setMoveParentId] = useState(ROOT_PARENT_VALUE);
    const [moveSortOrder, setMoveSortOrder] = useState("0");
    const [materials, setMaterials] = useState([]);
    const [materialsLoading, setMaterialsLoading] = useState(false);
    const [materialsError, setMaterialsError] = useState("");
    const [materialKeyword, setMaterialKeyword] = useState("");
    const [selectedMaterialId, setSelectedMaterialId] = useState(null);
    const [materialDetail, setMaterialDetail] = useState(null);
    const [materialDetailError, setMaterialDetailError] = useState("");
    const [bindingCategoryIds, setBindingCategoryIds] = useState([]);
    const [saving, setSaving] = useState(false);
    const [actionError, setActionError] = useState("");
    const [actionMessage, setActionMessage] = useState("");
    const flatNodes = useMemo(() => flattenCategoryNodes(tree.nodes), [tree.nodes]);
    const selectedNode = useMemo(() => flatNodes.find((x) => x.id === selectedCategoryId) ?? null, [flatNodes, selectedCategoryId]);
    const moveParentCandidates = useMemo(() => {
        if (!selectedNode) {
            return flatNodes;
        }
        const prefix = `${selectedNode.path}/`;
        return flatNodes.filter((x) => x.id !== selectedNode.id && !x.path.startsWith(prefix));
    }, [flatNodes, selectedNode]);
    const filteredMaterials = useMemo(() => {
        const keyword = materialKeyword.trim().toLowerCase();
        if (!keyword) {
            return materials;
        }
        return materials.filter((x) => {
            return x.title.toLowerCase().includes(keyword) || x.id.toLowerCase().includes(keyword);
        });
    }, [materialKeyword, materials]);
    useEffect(() => {
        void refreshTree();
        void refreshMaterials();
    }, []);
    useEffect(() => {
        if (!selectedNode) {
            setEditName("");
            setEditSortOrder("0");
            setMoveParentId(ROOT_PARENT_VALUE);
            setMoveSortOrder("0");
            return;
        }
        setEditName(selectedNode.name);
        setEditSortOrder(String(selectedNode.sortOrder));
        setMoveParentId(selectedNode.parentId ?? ROOT_PARENT_VALUE);
        setMoveSortOrder(String(selectedNode.sortOrder));
    }, [selectedNode]);
    useEffect(() => {
        if (!selectedMaterialId) {
            setMaterialDetail(null);
            setMaterialDetailError("");
            setBindingCategoryIds([]);
            return;
        }
        void loadMaterialDetail(selectedMaterialId);
    }, [selectedMaterialId]);
    async function refreshTree(preferredId) {
        setTreeLoading(true);
        setTreeError("");
        try {
            const data = await getCategoryTree();
            const nextFlatNodes = flattenCategoryNodes(data.nodes);
            const candidateId = preferredId ?? selectedCategoryId;
            const nextSelectedId = candidateId && nextFlatNodes.some((x) => x.id === candidateId)
                ? candidateId
                : (nextFlatNodes[0]?.id ?? null);
            setTree(data);
            setSelectedCategoryId(nextSelectedId);
        }
        catch (error) {
            setTreeError(error instanceof Error ? error.message : "分类树加载失败");
        }
        finally {
            setTreeLoading(false);
        }
    }
    async function refreshMaterials() {
        setMaterialsLoading(true);
        setMaterialsError("");
        try {
            const items = await listMaterialsForBinding();
            setMaterials(items);
            if (items.length === 0) {
                setSelectedMaterialId(null);
                return;
            }
            if (!selectedMaterialId || !items.some((x) => x.id === selectedMaterialId)) {
                setSelectedMaterialId(items[0].id);
            }
        }
        catch (error) {
            setMaterialsError(error instanceof Error ? error.message : "资料列表加载失败");
        }
        finally {
            setMaterialsLoading(false);
        }
    }
    async function loadMaterialDetail(materialId) {
        setMaterialDetailError("");
        try {
            const detail = await getMaterialDetail(materialId);
            setMaterialDetail(detail);
            const ids = Array.from(new Set(detail.categories.map((x) => x.id)));
            setBindingCategoryIds(ids);
        }
        catch (error) {
            setMaterialDetail(null);
            setBindingCategoryIds([]);
            setMaterialDetailError(error instanceof Error ? error.message : "资料详情加载失败");
        }
    }
    async function runAction(task) {
        setSaving(true);
        setActionError("");
        setActionMessage("");
        try {
            await task();
        }
        catch (error) {
            setActionError(error instanceof Error ? error.message : "操作失败");
        }
        finally {
            setSaving(false);
        }
    }
    return (_jsxs("section", { className: "panel", style: { marginBottom: 14 }, children: [_jsx("h3", { children: "\u5206\u7C7B\u6811\u7BA1\u7406" }), _jsxs("div", { className: "category-layout", children: [_jsxs("section", { className: "panel category-tree-panel", children: [_jsx("div", { className: "toolbar", children: _jsx("button", { onClick: () => void refreshTree(), disabled: treeLoading, children: treeLoading ? "刷新中..." : "刷新分类树" }) }), treeError ? _jsxs("div", { className: "muted", children: ["\u5206\u7C7B\u6811\u52A0\u8F7D\u5931\u8D25\uFF1A", treeError] }) : null, flatNodes.length === 0 ? _jsx("div", { className: "muted", children: "\u6682\u65E0\u5206\u7C7B" }) : null, _jsx("div", { className: "category-tree-list", children: flatNodes.map((node) => (_jsxs("button", { className: `category-tree-node ${selectedCategoryId === node.id ? "active" : ""}`, style: { paddingLeft: `${10 + node.depth * 18}px` }, onClick: () => setSelectedCategoryId(node.id), children: [_jsx("span", { children: node.name }), _jsxs("span", { className: "muted", children: ["#", node.sortOrder] })] }, node.id))) })] }), _jsxs("section", { className: "category-main-col", children: [_jsxs("section", { className: "panel", style: { borderStyle: "dashed", marginBottom: 12 }, children: [_jsx("h3", { children: "\u5F53\u524D\u5206\u7C7B" }), !selectedNode ? _jsx("div", { className: "muted", children: "\u8BF7\u9009\u62E9\u5DE6\u4FA7\u5206\u7C7B\u8282\u70B9" }) : null, selectedNode ? (_jsxs("div", { children: [_jsx("div", { children: _jsx("strong", { children: selectedNode.name }) }), _jsxs("div", { className: "muted", children: ["\u8DEF\u5F84\uFF1A", selectedNode.path] }), _jsxs("div", { className: "muted", children: ["\u5206\u7C7BID\uFF1A", selectedNode.id] })] })) : null, actionError ? _jsxs("div", { className: "muted", style: { marginTop: 8 }, children: ["\u64CD\u4F5C\u5931\u8D25\uFF1A", actionError] }) : null, actionMessage ? _jsxs("div", { className: "muted", style: { marginTop: 8 }, children: ["\u64CD\u4F5C\u6210\u529F\uFF1A", actionMessage] }) : null] }), _jsxs("section", { className: "panel", style: { borderStyle: "dashed", marginBottom: 12 }, children: [_jsx("h3", { children: "\u65B0\u589E\u5206\u7C7B" }), _jsxs("div", { className: "toolbar", children: [_jsx("input", { placeholder: "\u5206\u7C7B\u540D\u79F0", value: createName, onChange: (e) => setCreateName(e.target.value) }), _jsxs("select", { value: createParentId, onChange: (e) => setCreateParentId(e.target.value), children: [_jsx("option", { value: ROOT_PARENT_VALUE, children: "\u4F5C\u4E3A\u6839\u5206\u7C7B" }), flatNodes.map((node) => (_jsx("option", { value: node.id, children: node.path }, node.id)))] }), _jsx("input", { type: "number", placeholder: "\u6392\u5E8F", value: createSortOrder, onChange: (e) => setCreateSortOrder(e.target.value) }), _jsx("button", { className: "primary", disabled: saving || !createName.trim(), onClick: () => void runAction(async () => {
                                                    const parentId = createParentId === ROOT_PARENT_VALUE ? null : createParentId;
                                                    const sortOrder = normalizeSortOrder(createSortOrder);
                                                    const created = await createCategory({
                                                        name: createName.trim(),
                                                        parentId,
                                                        sortOrder,
                                                    });
                                                    setCreateName("");
                                                    setCreateSortOrder("0");
                                                    setActionMessage("分类创建成功");
                                                    await refreshTree(created.id);
                                                }), children: "\u65B0\u589E" })] })] }), _jsxs("section", { className: "panel", style: { borderStyle: "dashed", marginBottom: 12 }, children: [_jsx("h3", { children: "\u7F16\u8F91\u5206\u7C7B" }), _jsxs("div", { className: "toolbar", children: [_jsx("input", { placeholder: "\u5206\u7C7B\u540D\u79F0", value: editName, onChange: (e) => setEditName(e.target.value), disabled: !selectedNode }), _jsx("input", { type: "number", placeholder: "\u6392\u5E8F", value: editSortOrder, onChange: (e) => setEditSortOrder(e.target.value), disabled: !selectedNode }), _jsx("button", { className: "primary", disabled: saving || !selectedNode || !editName.trim(), onClick: () => void runAction(async () => {
                                                    if (!selectedNode) {
                                                        return;
                                                    }
                                                    await updateCategory(selectedNode.id, {
                                                        name: editName.trim(),
                                                        sortOrder: normalizeSortOrder(editSortOrder),
                                                    });
                                                    setActionMessage("分类更新成功");
                                                    await refreshTree(selectedNode.id);
                                                }), children: "\u4FDD\u5B58" })] })] }), _jsxs("section", { className: "panel", style: { borderStyle: "dashed", marginBottom: 12 }, children: [_jsx("h3", { children: "\u79FB\u52A8\u5206\u7C7B" }), _jsxs("div", { className: "toolbar", children: [_jsxs("select", { value: moveParentId, onChange: (e) => setMoveParentId(e.target.value), disabled: !selectedNode, children: [_jsx("option", { value: ROOT_PARENT_VALUE, children: "\u79FB\u52A8\u5230\u6839\u5206\u7C7B" }), moveParentCandidates.map((node) => (_jsx("option", { value: node.id, children: node.path }, node.id)))] }), _jsx("input", { type: "number", placeholder: "\u6392\u5E8F", value: moveSortOrder, onChange: (e) => setMoveSortOrder(e.target.value), disabled: !selectedNode }), _jsx("button", { className: "primary", disabled: saving || !selectedNode, onClick: () => void runAction(async () => {
                                                    if (!selectedNode) {
                                                        return;
                                                    }
                                                    const newParentId = moveParentId === ROOT_PARENT_VALUE ? null : moveParentId;
                                                    await moveCategory(selectedNode.id, {
                                                        newParentId,
                                                        newSortOrder: normalizeSortOrder(moveSortOrder),
                                                    });
                                                    setActionMessage("分类移动成功");
                                                    await refreshTree(selectedNode.id);
                                                }), children: "\u79FB\u52A8" }), _jsx("button", { className: "danger", disabled: saving || !selectedNode, onClick: () => void runAction(async () => {
                                                    if (!selectedNode) {
                                                        return;
                                                    }
                                                    const okFlag = window.confirm(`确认删除分类「${selectedNode.path}」？`);
                                                    if (!okFlag) {
                                                        return;
                                                    }
                                                    const deletingId = selectedNode.id;
                                                    await deleteCategory(deletingId);
                                                    setActionMessage("分类删除成功");
                                                    await refreshTree(null);
                                                }), children: "\u5220\u9664" })] })] }), _jsxs("section", { className: "panel", style: { borderStyle: "dashed" }, children: [_jsx("h3", { children: "\u8D44\u6599\u5206\u7C7B\u7ED1\u5B9A\uFF08\u624B\u52A8\uFF09" }), _jsxs("div", { className: "toolbar", children: [_jsx("input", { placeholder: "\u7B5B\u9009\u8D44\u6599\u6807\u9898/ID", value: materialKeyword, onChange: (e) => setMaterialKeyword(e.target.value) }), _jsxs("select", { value: selectedMaterialId ?? "", onChange: (e) => setSelectedMaterialId(e.target.value || null), children: [_jsx("option", { value: "", children: "\u8BF7\u9009\u62E9\u8D44\u6599" }), filteredMaterials.map((item) => (_jsx("option", { value: item.id, children: item.title }, item.id)))] }), _jsx("button", { onClick: () => void refreshMaterials(), disabled: materialsLoading, children: materialsLoading ? "刷新中..." : "刷新资料" })] }), materialsError ? _jsxs("div", { className: "muted", children: ["\u8D44\u6599\u5217\u8868\u52A0\u8F7D\u5931\u8D25\uFF1A", materialsError] }) : null, materialDetailError ? _jsxs("div", { className: "muted", children: ["\u8D44\u6599\u8BE6\u60C5\u52A0\u8F7D\u5931\u8D25\uFF1A", materialDetailError] }) : null, materialDetail ? (_jsxs("div", { className: "muted", style: { marginBottom: 8 }, children: ["\u5F53\u524D\u5206\u7C7B\uFF1A", dedupePaths(materialDetail.categories.map((x) => x.path)).join(" / ") || "未绑定"] })) : null, _jsxs("div", { className: "toolbar", children: [_jsx("button", { onClick: () => setBindingCategoryIds(flatNodes.map((x) => x.id)), disabled: !selectedMaterialId, children: "\u5168\u9009" }), _jsx("button", { onClick: () => setBindingCategoryIds([]), disabled: !selectedMaterialId, children: "\u6E05\u7A7A" }), _jsx("button", { className: "primary", disabled: saving || !selectedMaterialId, onClick: () => void runAction(async () => {
                                                    if (!selectedMaterialId) {
                                                        return;
                                                    }
                                                    await bindMaterialCategories(selectedMaterialId, {
                                                        categoryIds: bindingCategoryIds,
                                                        source: "manual",
                                                    });
                                                    setActionMessage("资料分类绑定已更新");
                                                    await loadMaterialDetail(selectedMaterialId);
                                                    await refreshTree(selectedCategoryId);
                                                }), children: "\u4FDD\u5B58\u7ED1\u5B9A" })] }), _jsx("div", { className: "category-checkbox-list", children: flatNodes.map((node) => (_jsxs("label", { className: "category-checkbox-item", children: [_jsx("input", { type: "checkbox", checked: bindingCategoryIds.includes(node.id), disabled: !selectedMaterialId, onChange: (e) => {
                                                        const checked = e.target.checked;
                                                        setBindingCategoryIds((prev) => {
                                                            if (checked) {
                                                                return Array.from(new Set([...prev, node.id]));
                                                            }
                                                            return prev.filter((id) => id !== node.id);
                                                        });
                                                    } }), _jsx("span", { children: node.path })] }, node.id))) })] })] })] })] }));
}
function flattenCategoryNodes(nodes, depth = 0) {
    const result = [];
    for (const node of nodes) {
        result.push({
            id: node.id,
            name: node.name,
            parentId: node.parentId,
            path: node.path,
            sortOrder: node.sortOrder,
            depth,
        });
        result.push(...flattenCategoryNodes(node.children, depth + 1));
    }
    return result;
}
function normalizeSortOrder(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return 0;
    }
    return Math.trunc(parsed);
}
function dedupePaths(paths) {
    return Array.from(new Set(paths.filter(Boolean)));
}
