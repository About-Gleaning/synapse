import { useEffect, useMemo, useState } from "react";
import type { CategoryNodeVO, CategoryTreeVO, MaterialDetailVO, MaterialListVO } from "@synapse/shared";
import {
  bindMaterialCategories,
  createCategory,
  deleteCategory,
  getCategoryTree,
  getMaterialDetail,
  listMaterialsForBinding,
  moveCategory,
  updateCategory,
} from "../api/categoryApi";

interface FlatCategoryNode {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  sortOrder: number;
  depth: number;
}

const ROOT_PARENT_VALUE = "__ROOT__";

export function CategoryManagementPanel(): React.JSX.Element {
  const [tree, setTree] = useState<CategoryTreeVO>({ nodes: [] });
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const [createName, setCreateName] = useState("");
  const [createParentId, setCreateParentId] = useState<string>(ROOT_PARENT_VALUE);
  const [createSortOrder, setCreateSortOrder] = useState("0");

  const [editName, setEditName] = useState("");
  const [editSortOrder, setEditSortOrder] = useState("0");

  const [moveParentId, setMoveParentId] = useState<string>(ROOT_PARENT_VALUE);
  const [moveSortOrder, setMoveSortOrder] = useState("0");

  const [materials, setMaterials] = useState<MaterialListVO["items"]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState("");
  const [materialKeyword, setMaterialKeyword] = useState("");
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [materialDetail, setMaterialDetail] = useState<MaterialDetailVO | null>(null);
  const [materialDetailError, setMaterialDetailError] = useState("");
  const [bindingCategoryIds, setBindingCategoryIds] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const flatNodes = useMemo(() => flattenCategoryNodes(tree.nodes), [tree.nodes]);
  const selectedNode = useMemo(
    () => flatNodes.find((x) => x.id === selectedCategoryId) ?? null,
    [flatNodes, selectedCategoryId],
  );

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

  async function refreshTree(preferredId?: string | null): Promise<void> {
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
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : "分类树加载失败");
    } finally {
      setTreeLoading(false);
    }
  }

  async function refreshMaterials(): Promise<void> {
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
    } catch (error) {
      setMaterialsError(error instanceof Error ? error.message : "资料列表加载失败");
    } finally {
      setMaterialsLoading(false);
    }
  }

  async function loadMaterialDetail(materialId: string): Promise<void> {
    setMaterialDetailError("");
    try {
      const detail = await getMaterialDetail(materialId);
      setMaterialDetail(detail);
      const ids = Array.from(new Set(detail.categories.map((x) => x.id)));
      setBindingCategoryIds(ids);
    } catch (error) {
      setMaterialDetail(null);
      setBindingCategoryIds([]);
      setMaterialDetailError(error instanceof Error ? error.message : "资料详情加载失败");
    }
  }

  async function runAction(task: () => Promise<void>): Promise<void> {
    setSaving(true);
    setActionError("");
    setActionMessage("");
    try {
      await task();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "操作失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel" style={{ marginBottom: 14 }}>
      <h3>分类树管理</h3>
      <div className="category-layout">
        <section className="panel category-tree-panel">
          <div className="toolbar">
            <button onClick={() => void refreshTree()} disabled={treeLoading}>
              {treeLoading ? "刷新中..." : "刷新分类树"}
            </button>
          </div>
          {treeError ? <div className="muted">分类树加载失败：{treeError}</div> : null}
          {flatNodes.length === 0 ? <div className="muted">暂无分类</div> : null}
          <div className="category-tree-list">
            {flatNodes.map((node) => (
              <button
                key={node.id}
                className={`category-tree-node ${selectedCategoryId === node.id ? "active" : ""}`}
                style={{ paddingLeft: `${10 + node.depth * 18}px` }}
                onClick={() => setSelectedCategoryId(node.id)}
              >
                <span>{node.name}</span>
                <span className="muted">#{node.sortOrder}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="category-main-col">
          <section className="panel" style={{ borderStyle: "dashed", marginBottom: 12 }}>
            <h3>当前分类</h3>
            {!selectedNode ? <div className="muted">请选择左侧分类节点</div> : null}
            {selectedNode ? (
              <div>
                <div>
                  <strong>{selectedNode.name}</strong>
                </div>
                <div className="muted">路径：{selectedNode.path}</div>
                <div className="muted">分类ID：{selectedNode.id}</div>
              </div>
            ) : null}
            {actionError ? <div className="muted" style={{ marginTop: 8 }}>操作失败：{actionError}</div> : null}
            {actionMessage ? <div className="muted" style={{ marginTop: 8 }}>操作成功：{actionMessage}</div> : null}
          </section>

          <section className="panel" style={{ borderStyle: "dashed", marginBottom: 12 }}>
            <h3>新增分类</h3>
            <div className="toolbar">
              <input
                placeholder="分类名称"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
              <select value={createParentId} onChange={(e) => setCreateParentId(e.target.value)}>
                <option value={ROOT_PARENT_VALUE}>作为根分类</option>
                {flatNodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.path}
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder="排序"
                value={createSortOrder}
                onChange={(e) => setCreateSortOrder(e.target.value)}
              />
              <button
                className="primary"
                disabled={saving || !createName.trim()}
                onClick={() =>
                  void runAction(async () => {
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
                  })
                }
              >
                新增
              </button>
            </div>
          </section>

          <section className="panel" style={{ borderStyle: "dashed", marginBottom: 12 }}>
            <h3>编辑分类</h3>
            <div className="toolbar">
              <input
                placeholder="分类名称"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={!selectedNode}
              />
              <input
                type="number"
                placeholder="排序"
                value={editSortOrder}
                onChange={(e) => setEditSortOrder(e.target.value)}
                disabled={!selectedNode}
              />
              <button
                className="primary"
                disabled={saving || !selectedNode || !editName.trim()}
                onClick={() =>
                  void runAction(async () => {
                    if (!selectedNode) {
                      return;
                    }
                    await updateCategory(selectedNode.id, {
                      name: editName.trim(),
                      sortOrder: normalizeSortOrder(editSortOrder),
                    });
                    setActionMessage("分类更新成功");
                    await refreshTree(selectedNode.id);
                  })
                }
              >
                保存
              </button>
            </div>
          </section>

          <section className="panel" style={{ borderStyle: "dashed", marginBottom: 12 }}>
            <h3>移动分类</h3>
            <div className="toolbar">
              <select
                value={moveParentId}
                onChange={(e) => setMoveParentId(e.target.value)}
                disabled={!selectedNode}
              >
                <option value={ROOT_PARENT_VALUE}>移动到根分类</option>
                {moveParentCandidates.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.path}
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder="排序"
                value={moveSortOrder}
                onChange={(e) => setMoveSortOrder(e.target.value)}
                disabled={!selectedNode}
              />
              <button
                className="primary"
                disabled={saving || !selectedNode}
                onClick={() =>
                  void runAction(async () => {
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
                  })
                }
              >
                移动
              </button>
              <button
                className="danger"
                disabled={saving || !selectedNode}
                onClick={() =>
                  void runAction(async () => {
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
                  })
                }
              >
                删除
              </button>
            </div>
          </section>

          <section className="panel" style={{ borderStyle: "dashed" }}>
            <h3>资料分类绑定（手动）</h3>
            <div className="toolbar">
              <input
                placeholder="筛选资料标题/ID"
                value={materialKeyword}
                onChange={(e) => setMaterialKeyword(e.target.value)}
              />
              <select
                value={selectedMaterialId ?? ""}
                onChange={(e) => setSelectedMaterialId(e.target.value || null)}
              >
                <option value="">请选择资料</option>
                {filteredMaterials.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
              <button onClick={() => void refreshMaterials()} disabled={materialsLoading}>
                {materialsLoading ? "刷新中..." : "刷新资料"}
              </button>
            </div>
            {materialsError ? <div className="muted">资料列表加载失败：{materialsError}</div> : null}
            {materialDetailError ? <div className="muted">资料详情加载失败：{materialDetailError}</div> : null}
            {materialDetail ? (
              <div className="muted" style={{ marginBottom: 8 }}>
                当前分类：
                {dedupePaths(materialDetail.categories.map((x) => x.path)).join(" / ") || "未绑定"}
              </div>
            ) : null}
            <div className="toolbar">
              <button
                onClick={() => setBindingCategoryIds(flatNodes.map((x) => x.id))}
                disabled={!selectedMaterialId}
              >
                全选
              </button>
              <button onClick={() => setBindingCategoryIds([])} disabled={!selectedMaterialId}>
                清空
              </button>
              <button
                className="primary"
                disabled={saving || !selectedMaterialId}
                onClick={() =>
                  void runAction(async () => {
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
                  })
                }
              >
                保存绑定
              </button>
            </div>
            <div className="category-checkbox-list">
              {flatNodes.map((node) => (
                <label key={node.id} className="category-checkbox-item">
                  <input
                    type="checkbox"
                    checked={bindingCategoryIds.includes(node.id)}
                    disabled={!selectedMaterialId}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setBindingCategoryIds((prev) => {
                        if (checked) {
                          return Array.from(new Set([...prev, node.id]));
                        }
                        return prev.filter((id) => id !== node.id);
                      });
                    }}
                  />
                  <span>{node.path}</span>
                </label>
              ))}
            </div>
          </section>
        </section>
      </div>
    </section>
  );
}

function flattenCategoryNodes(nodes: CategoryNodeVO[], depth = 0): FlatCategoryNode[] {
  const result: FlatCategoryNode[] = [];
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

function normalizeSortOrder(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.trunc(parsed);
}

function dedupePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.filter(Boolean)));
}
