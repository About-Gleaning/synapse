import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ApiResp,
  CategoryNodeVO,
  CategoryTreeVO,
  MaterialContentKind,
  MaterialContentVO,
  MaterialDetailVO,
  MaterialImportVO,
  MaterialListVO,
} from "@synapse/shared";
import { buildApiUrl, describeApiBaseUrl } from "../../shared/api/baseUrl";
import { requestJson } from "../../shared/api/httpClient";

export interface MaterialsPanelFocusRequest {
  materialId: string | null;
  threadId: string | null;
  preferredContentKind?: MaterialContentKind;
  highlightSnippet?: string;
  token: number;
}

export interface MaterialsPanelProps {
  sectionId?: string;
  focusRequest?: MaterialsPanelFocusRequest;
  onNavigateToChatWithMention?: (payload: {
    materialId: string;
    materialTitle: string;
    forceNewThread?: boolean;
  }) => void;
}

type TreeSelection =
  | {
      type: "category";
      categoryId: string;
    }
  | {
      type: "material";
      materialId: string;
      fromCategoryId?: string;
    }
  | {
      type: "uncategorized";
    };

type DetailViewKind = "detailed_notes" | "original";

const UNCATEGORIZED_NODE_ID = "__uncategorized__";
const MAX_SUMMARY_ITEMS = 8;
const MAX_SUMMARY_TEXT_LENGTH = 1200;

export function MaterialsPanel(props: MaterialsPanelProps): React.JSX.Element {
  const [sourceUrl, setSourceUrl] = useState("");
  const [importLoading, setImportLoading] = useState(false);

  const [materials, setMaterials] = useState<MaterialListVO["items"]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);

  const [categoryTree, setCategoryTree] = useState<CategoryTreeVO>({ nodes: [] });
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState("");

  const [selection, setSelection] = useState<TreeSelection>({ type: "uncategorized" });
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<string[]>([]);
  const [uncategorizedExpanded, setUncategorizedExpanded] = useState(true);

  const [categoryMaterialsMap, setCategoryMaterialsMap] = useState<Record<string, MaterialListVO["items"]>>({});
  const [categoryMaterialsLoadingMap, setCategoryMaterialsLoadingMap] = useState<Record<string, boolean>>({});
  const [categoryMaterialsErrorMap, setCategoryMaterialsErrorMap] = useState<Record<string, string>>({});

  const [detailInfoOpen, setDetailInfoOpen] = useState(false);
  const [detail, setDetail] = useState<MaterialDetailVO | null>(null);
  const [detailError, setDetailError] = useState("");

  const [summaryContent, setSummaryContent] = useState("");
  const [summaryError, setSummaryError] = useState("");

  const [detailViewKind, setDetailViewKind] = useState<DetailViewKind>("detailed_notes");
  const [detailContent, setDetailContent] = useState("");
  const [detailContentError, setDetailContentError] = useState("");

  const [highlightSnippet, setHighlightSnippet] = useState("");
  const [highlightToken, setHighlightToken] = useState(0);

  const summaryHighlightRef = useRef<HTMLElement | null>(null);
  const detailHighlightRef = useRef<HTMLElement | null>(null);

  const selectedMaterialId = selection.type === "material" ? selection.materialId : null;
  const selectedCategoryId = selection.type === "category" ? selection.categoryId : null;

  const allCategoryIds = useMemo(() => collectCategoryIds(categoryTree.nodes), [categoryTree.nodes]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, CategoryNodeVO>();
    for (const node of flattenCategoryTree(categoryTree.nodes)) {
      map.set(node.id, node);
    }
    return map;
  }, [categoryTree.nodes]);

  const uncategorizedMaterials = useMemo(
    () => materials.filter((item) => item.categoryPaths.length === 0),
    [materials],
  );

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

  const canNavigateToChatWithMention =
    !!props.onNavigateToChatWithMention && !!selectedMaterialId && !!selectedMaterialTitle;

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

  async function loadMaterials(): Promise<void> {
    setMaterialsLoading(true);
    try {
      const data = await requestJson<MaterialListVO>("/api/materials?page=1&pageSize=100", { method: "GET" });
      setMaterials(data.items);
    } catch {
      setMaterials([]);
    } finally {
      setMaterialsLoading(false);
    }
  }

  async function loadCategoryTree(): Promise<void> {
    setTreeLoading(true);
    setTreeError("");
    try {
      const data = await requestJson<CategoryTreeVO>("/api/categories/tree", { method: "GET" });
      setCategoryTree(data);
      if (expandedCategoryIds.length === 0) {
        setExpandedCategoryIds(data.nodes.map((item) => item.id));
      }
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : "分类树读取失败");
      setCategoryTree({ nodes: [] });
    } finally {
      setTreeLoading(false);
    }
  }

  async function loadCategoryMaterials(categoryId: string, force = false): Promise<void> {
    if (!force && categoryMaterialsMap[categoryId]) {
      return;
    }

    setCategoryMaterialsLoadingMap((prev) => ({ ...prev, [categoryId]: true }));
    setCategoryMaterialsErrorMap((prev) => ({ ...prev, [categoryId]: "" }));

    try {
      const data = await requestJson<MaterialListVO>(
        `/api/materials?page=1&pageSize=100&categoryId=${encodeURIComponent(categoryId)}`,
        { method: "GET" },
      );
      setCategoryMaterialsMap((prev) => ({
        ...prev,
        [categoryId]: dedupeMaterialsById(data.items),
      }));
    } catch (error) {
      setCategoryMaterialsMap((prev) => ({ ...prev, [categoryId]: [] }));
      setCategoryMaterialsErrorMap((prev) => ({
        ...prev,
        [categoryId]: error instanceof Error ? error.message : "分类资料读取失败",
      }));
    } finally {
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
        const detailJson = await requestJson<MaterialDetailVO>(`/api/materials/${selectedMaterialId}`, {
          method: "GET",
        });
        setDetail(detailJson);
        setDetailError("");
      } catch (error) {
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
        const json = await requestJson<MaterialContentVO>(
          `/api/materials/${selectedMaterialId}/content?kind=brief_summary`,
          { method: "GET" },
        );
        setSummaryContent(json.content);
        setSummaryError("");
      } catch (error) {
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

    const contentKind: MaterialContentKind = detailViewKind === "original" ? "original" : "detailed_notes";
    void (async () => {
      try {
        const json = await requestJson<MaterialContentVO>(
          `/api/materials/${selectedMaterialId}/content?kind=${contentKind}`,
          { method: "GET" },
        );
        setDetailContent(json.content);
        setDetailContentError("");
      } catch (error) {
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
    } else {
      setDetailViewKind("detailed_notes");
    }

    if (props.focusRequest.highlightSnippet?.trim()) {
      setHighlightSnippet(props.focusRequest.highlightSnippet.trim());
      setHighlightToken(props.focusRequest.token);
    } else {
      setHighlightSnippet("");
      setHighlightToken(0);
    }
  }, [props.focusRequest?.token]);

  useEffect(() => {
    if (selection.type === "category" && !allCategoryIds.includes(selection.categoryId)) {
      setSelection({ type: "uncategorized" });
    }
  }, [selection.type, selection.type === "category" ? selection.categoryId : "", allCategoryIds]);

  const onToggleCategoryExpand = (categoryId: string): void => {
    const expanded = expandedCategoryIds.includes(categoryId);
    if (expanded) {
      setExpandedCategoryIds((prev) => prev.filter((id) => id !== categoryId));
      return;
    }
    setExpandedCategoryIds((prev) => [...prev, categoryId]);
    void loadCategoryMaterials(categoryId);
  };

  const onSelectCategory = (categoryId: string): void => {
    setSelection({ type: "category", categoryId });
    if (!expandedCategoryIds.includes(categoryId)) {
      setExpandedCategoryIds((prev) => [...prev, categoryId]);
    }
    setHighlightSnippet("");
    setHighlightToken(0);
    void loadCategoryMaterials(categoryId);
  };

  const onSelectMaterial = (materialId: string, fromCategoryId?: string): void => {
    setSelection({ type: "material", materialId, fromCategoryId });
    setDetailViewKind("detailed_notes");
    setHighlightSnippet("");
    setHighlightToken(0);
  };

  const onSelectUncategorized = (): void => {
    setSelection({ type: "uncategorized" });
    setHighlightSnippet("");
    setHighlightToken(0);
  };

  const renderTree = (nodes: CategoryNodeVO[], depth = 0): React.JSX.Element[] => {
    return nodes.map((node) => {
      const expanded = expandedCategoryIds.includes(node.id);
      const isActive = selection.type === "category" && selection.categoryId === node.id;
      const materialsUnderCategory = categoryMaterialsMap[node.id] ?? [];
      const loading = !!categoryMaterialsLoadingMap[node.id];
      const errorText = categoryMaterialsErrorMap[node.id] ?? "";

      return (
        <div key={node.id} className="materials-tree-node-group">
          <div className={`materials-tree-category-row ${isActive ? "active" : ""}`} style={{ paddingLeft: `${8 + depth * 16}px` }}>
            <button
              type="button"
              className="materials-tree-expand-btn"
              onClick={() => onToggleCategoryExpand(node.id)}
              aria-label={expanded ? "收起分类" : "展开分类"}
            >
              {expanded ? "-" : "+"}
            </button>
            <button type="button" className="materials-tree-category-btn" onClick={() => onSelectCategory(node.id)}>
              {node.name}
            </button>
          </div>

          {expanded ? (
            <div className="materials-tree-children-wrap">
              {renderTree(node.children, depth + 1)}

              {loading ? <div className="materials-tree-hint" style={{ paddingLeft: `${26 + depth * 16}px` }}>资料加载中...</div> : null}
              {errorText ? (
                <div className="materials-tree-hint" style={{ paddingLeft: `${26 + depth * 16}px` }}>
                  资料读取失败：{errorText}
                </div>
              ) : null}

              {!loading && !errorText && materialsUnderCategory.length === 0 ? (
                <div className="materials-tree-hint" style={{ paddingLeft: `${26 + depth * 16}px` }}>暂无资料</div>
              ) : null}

              {!loading && !errorText
                ? materialsUnderCategory.map((item) => {
                    const leafActive = selection.type === "material" && selection.materialId === item.id;
                    return (
                      <button
                        key={`${node.id}-${item.id}`}
                        type="button"
                        className={`materials-tree-leaf-btn ${leafActive ? "active" : ""}`}
                        style={{ paddingLeft: `${26 + depth * 16}px` }}
                        onClick={() => onSelectMaterial(item.id, node.id)}
                      >
                        {item.title}
                      </button>
                    );
                  })
                : null}
            </div>
          ) : null}
        </div>
      );
    });
  };

  const renderSummaryPanel = (): React.JSX.Element => {
    if (selection.type === "material") {
      return (
        <>
          {summaryError ? <div className="muted">精简总结读取失败：{summaryError}</div> : null}
          {highlightSnippet ? (
            <div className="muted" style={{ marginBottom: 8 }}>
              {summaryHighlightRange || detailHighlightRange ? "已定位到引用片段" : "未匹配到精确片段"}
            </div>
          ) : null}
          <article className="answer-box answer-box-plain materials-content-box">
            {!summaryContent ? "当前资料暂无精简总结" : null}
            {summaryContent && summaryHighlightRange
              ? (
                  <>
                    {summaryContent.slice(0, summaryHighlightRange.start)}
                    <mark ref={summaryHighlightRef}>
                      {summaryContent.slice(summaryHighlightRange.start, summaryHighlightRange.end)}
                    </mark>
                    {summaryContent.slice(summaryHighlightRange.end)}
                  </>
                )
              : summaryContent}
          </article>
        </>
      );
    }

    const text = selection.type === "category" ? categorySummaryText : uncategorizedSummaryText;
    return <article className="answer-box answer-box-plain materials-content-box">{text || "暂无可展示的精简总结"}</article>;
  };

  const renderDetailPanel = (): React.JSX.Element => {
    if (selection.type === "material") {
      return (
        <>
          <div className="materials-detail-subtoolbar">
            <span className="muted">当前视图：{detailViewKind === "original" ? "原文" : "详细整理"}</span>
            <button
              type="button"
              disabled={detailViewKind === "detailed_notes"}
              onClick={() => setDetailViewKind("detailed_notes")}
            >
              查看详细整理
            </button>
          </div>
          {detailContentError ? <div className="muted">内容读取失败：{detailContentError}</div> : null}
          <article className="answer-box answer-box-plain materials-content-box">
            {!detailContent ? (detailViewKind === "original" ? "当前资料暂无原文" : "当前资料暂无详细整理") : null}
            {detailContent && detailHighlightRange
              ? (
                  <>
                    {detailContent.slice(0, detailHighlightRange.start)}
                    <mark ref={detailHighlightRef}>{detailContent.slice(detailHighlightRange.start, detailHighlightRange.end)}</mark>
                    {detailContent.slice(detailHighlightRange.end)}
                  </>
                )
              : detailContent}
          </article>
        </>
      );
    }

    if (selection.type === "category") {
      return (
        <div className="materials-category-list">
          {isSelectedCategoryLoading ? <div className="muted">分类资料加载中...</div> : null}
          {selectedCategoryError ? <div className="muted">分类资料读取失败：{selectedCategoryError}</div> : null}
          {!isSelectedCategoryLoading && !selectedCategoryError && selectedCategoryMaterials.length === 0 ? (
            <div className="muted">该分类下暂无资料</div>
          ) : null}
          {!isSelectedCategoryLoading && !selectedCategoryError
            ? selectedCategoryMaterials.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="materials-category-item"
                  onClick={() => onSelectMaterial(item.id, selectedCategoryId ?? undefined)}
                >
                  <div className="materials-category-item-title">{item.title}</div>
                  <div className="materials-category-item-meta">状态：{item.status} | 更新时间：{item.updatedAt}</div>
                </button>
              ))
            : null}
        </div>
      );
    }

    return (
      <div className="materials-category-list">
        {uncategorizedMaterials.length === 0 ? <div className="muted">暂无未分类资料</div> : null}
        {uncategorizedMaterials.map((item) => (
          <button
            key={item.id}
            type="button"
            className="materials-category-item"
            onClick={() => onSelectMaterial(item.id)}
          >
            <div className="materials-category-item-title">{item.title}</div>
            <div className="materials-category-item-meta">状态：{item.status} | 更新时间：{item.updatedAt}</div>
          </button>
        ))}
      </div>
    );
  };

  return (
    <section id={props.sectionId} className="panel" style={{ marginBottom: 14 }}>
      <h3>资料工作台</h3>

      <div className="materials-workspace-shell">
        <aside className="materials-tree-panel">
          <div className="materials-tree-toolbar">
            <strong>资料分类</strong>
            <button
              type="button"
              onClick={() => {
                void loadCategoryTree();
                void loadMaterials();
              }}
              disabled={treeLoading || materialsLoading}
            >
              {treeLoading || materialsLoading ? "刷新中..." : "刷新"}
            </button>
          </div>

          {treeError ? <div className="materials-tree-hint">分类树读取失败：{treeError}</div> : null}

          <div className="materials-tree-scroll">
            {categoryTree.nodes.length === 0 ? <div className="materials-tree-hint">暂无分类</div> : null}
            {renderTree(categoryTree.nodes)}

            <div className={`materials-tree-category-row ${selection.type === "uncategorized" ? "active" : ""}`}>
              <button
                type="button"
                className="materials-tree-expand-btn"
                onClick={() => setUncategorizedExpanded((prev) => !prev)}
                aria-label={uncategorizedExpanded ? "收起未分类" : "展开未分类"}
              >
                {uncategorizedExpanded ? "-" : "+"}
              </button>
              <button type="button" className="materials-tree-category-btn" onClick={onSelectUncategorized}>
                未分类
              </button>
            </div>

            {uncategorizedExpanded
              ? uncategorizedMaterials.map((item) => {
                  const leafActive = selection.type === "material" && selection.materialId === item.id;
                  return (
                    <button
                      key={`${UNCATEGORIZED_NODE_ID}-${item.id}`}
                      type="button"
                      className={`materials-tree-leaf-btn ${leafActive ? "active" : ""}`}
                      style={{ paddingLeft: "24px" }}
                      onClick={() => onSelectMaterial(item.id)}
                    >
                      {item.title}
                    </button>
                  );
                })
              : null}
          </div>
        </aside>

        <section className="materials-main-panel">
          <div className="materials-actions">
            <button
              type="button"
              onClick={() => {
                if (!selectedMaterialId) {
                  window.alert("请先选择资料再查看详情");
                  return;
                }
                setDetailInfoOpen(true);
              }}
              disabled={!selectedMaterialId}
            >
              查看详细信息
            </button>
            <button
              type="button"
              disabled={!canNavigateToChatWithMention}
              onClick={() => {
                if (!selectedMaterialId || !selectedMaterialTitle) {
                  return;
                }
                props.onNavigateToChatWithMention?.({
                  materialId: selectedMaterialId,
                  materialTitle: selectedMaterialTitle,
                  forceNewThread: true,
                });
              }}
            >
              去首页问答
            </button>
            <button
              type="button"
              disabled={!selectedMaterialId}
              onClick={() => setDetailViewKind("original")}
            >
              查看原文
            </button>

            <input
              className="materials-import-input"
              placeholder="输入网页 URL"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
            <button
              type="button"
              className="primary"
              disabled={importLoading || !sourceUrl.trim()}
              onClick={async () => {
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
                  const json = (await resp.json()) as ApiResp<MaterialImportVO> & {
                    data?: { materialId?: string };
                  };
                  if (json.code === "MATERIAL_DUPLICATE" && json.data?.materialId) {
                    setSelection({ type: "material", materialId: json.data.materialId });
                    setDetailViewKind("detailed_notes");
                    setSourceUrl("");
                    setHighlightSnippet("");
                    setHighlightToken(0);
                    await Promise.all([loadMaterials(), loadCategoryTree()]);
                  } else if (json.code !== "OK") {
                    window.alert(json.message || "导入资料失败");
                  } else {
                    setSelection({ type: "material", materialId: json.data.materialId });
                    setDetailViewKind("detailed_notes");
                    setSourceUrl("");
                    setHighlightSnippet("");
                    setHighlightToken(0);
                    await Promise.all([loadMaterials(), loadCategoryTree()]);
                  }
                } catch (error) {
                  const msg = error instanceof Error ? error.message : "导入资料失败";
                  window.alert(`导入资料失败：${msg}。接口基址：${describeApiBaseUrl()}`);
                } finally {
                  setImportLoading(false);
                }
              }}
            >
              {importLoading ? "导入中..." : "导入资料"}
            </button>
          </div>

          <section className="panel materials-summary-panel">
            <h3>精简总结</h3>
            {renderSummaryPanel()}
          </section>

          <section className="panel materials-detail-panel">
            <h3>{selection.type === "material" ? "详细整理" : "资料列表"}</h3>
            {renderDetailPanel()}
          </section>
        </section>
      </div>

      {detailInfoOpen ? (
        <div className="materials-detail-drawer-backdrop" onClick={() => setDetailInfoOpen(false)}>
          <section
            className="materials-detail-drawer"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="materials-drawer-header">
              <h3>资料详细信息</h3>
              <button type="button" onClick={() => setDetailInfoOpen(false)}>
                关闭
              </button>
            </div>

            {!selectedMaterialId ? <div className="muted">请先选择资料</div> : null}
            {selectedMaterialId && detailError ? <div className="muted">详情读取失败：{detailError}</div> : null}

            {selectedMaterialId && detail ? (
              <div className="material-meta-grid">
                <div>
                  <div>
                    <strong>标题：</strong>
                    {detail.title}
                  </div>
                  <div className="muted">资料ID：{detail.id}</div>
                  <div className="muted">来源类型：{detail.sourceType}</div>
                  <div className="muted">状态：{detail.status}</div>
                  <div className="muted">抓取阶段：{detail.ingestStage}</div>
                </div>
                <div>
                  <div className="muted">精简总结：{detail.briefSummaryStatus}</div>
                  <div className="muted">详细整理：{detail.detailedNotesStatus}</div>
                  <div className="muted">分类建议：{detail.classifyStatus}</div>
                  <div className="muted">创建时间：{detail.createdAt}</div>
                  <div className="muted">更新时间：{detail.updatedAt}</div>
                </div>
                <div>
                  <div className="muted">分类路径：</div>
                  <div>{detail.categories.length > 0 ? detail.categories.map((x) => x.path).join(" / ") : "未绑定分类"}</div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    原始链接：{detail.originalUrl}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function flattenCategoryTree(nodes: CategoryNodeVO[]): CategoryNodeVO[] {
  const result: CategoryNodeVO[] = [];
  for (const node of nodes) {
    result.push(node);
    result.push(...flattenCategoryTree(node.children));
  }
  return result;
}

function collectCategoryIds(nodes: CategoryNodeVO[]): string[] {
  return flattenCategoryTree(nodes).map((node) => node.id);
}

function dedupeMaterialsById(items: MaterialListVO["items"]): MaterialListVO["items"] {
  const map = new Map<string, MaterialListVO["items"][number]>();
  for (const item of items) {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

function buildCategorySummary(categoryName: string, items: MaterialListVO["items"]): string {
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

function findSnippetRange(content: string, snippet: string): { start: number; end: number } | null {
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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
