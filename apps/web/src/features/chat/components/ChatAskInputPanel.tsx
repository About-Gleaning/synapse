import { useMemo, useState } from "react";

export interface ChatCategoryOption {
  id: string;
  path: string;
  depth: number;
}

export interface ChatAskInputPanelProps {
  question: string;
  isRunning: boolean;
  canSubmit: boolean;
  canCancel: boolean;
  selectedCategoryIds: string[];
  categoryOptions: ChatCategoryOption[];
  categoryOptionsLoading?: boolean;
  categoryOptionsError?: string;
  serverHealthError?: string;
  onRetryHealthCheck?: () => void;
  onQuestionChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onChangeCategoryIds?: (ids: string[]) => void;
}

export function ChatAskInputPanel(props: ChatAskInputPanelProps): React.JSX.Element {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const selectedSet = useMemo(() => new Set(props.selectedCategoryIds), [props.selectedCategoryIds]);
  const filteredOptions = useMemo(() => {
    const trimmed = keyword.trim().toLowerCase();
    if (!trimmed) {
      return props.categoryOptions;
    }
    return props.categoryOptions.filter((item) => item.path.toLowerCase().includes(trimmed));
  }, [keyword, props.categoryOptions]);

  const upsertCategory = (categoryId: string, checked: boolean): void => {
    const nextSet = new Set(props.selectedCategoryIds);
    if (checked) {
      nextSet.add(categoryId);
    } else {
      nextSet.delete(categoryId);
    }
    props.onChangeCategoryIds?.(Array.from(nextSet));
  };

  return (
    <section className="panel">
      <h3>提问输入</h3>
      <div className="toolbar">
        <button onClick={() => setPickerOpen((x) => !x)}>
          分类过滤（已选 {props.selectedCategoryIds.length}）
        </button>
        <button
          disabled={props.selectedCategoryIds.length === 0}
          onClick={() => props.onChangeCategoryIds?.([])}
        >
          清空分类
        </button>
      </div>
      {pickerOpen ? (
        <div className="chat-category-picker">
          <div className="toolbar" style={{ marginBottom: 6 }}>
            <input
              style={{ minWidth: 280 }}
              placeholder="筛选分类路径"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          {props.categoryOptionsLoading ? <div className="muted">分类加载中...</div> : null}
          {props.categoryOptionsError ? <div className="muted">分类加载失败：{props.categoryOptionsError}</div> : null}
          {!props.categoryOptionsLoading && filteredOptions.length === 0 ? (
            <div className="muted">暂无可选分类</div>
          ) : null}
          <div className="chat-category-list">
            {filteredOptions.map((item) => (
              <label key={item.id} className="chat-category-item" style={{ paddingLeft: `${8 + item.depth * 14}px` }}>
                <input
                  type="checkbox"
                  checked={selectedSet.has(item.id)}
                  onChange={(e) => upsertCategory(item.id, e.target.checked)}
                />
                <span>{item.path}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {props.selectedCategoryIds.length > 0 ? (
        <div className="muted" style={{ marginBottom: 10 }}>
          已启用分类过滤，将缩小检索范围
        </div>
      ) : (
        <div className="muted" style={{ marginBottom: 10 }}>
          未选择分类，将在全部资料范围检索
        </div>
      )}

      <div className="toolbar">
        <button
          disabled={props.categoryOptions.length === 0}
          onClick={() => props.onChangeCategoryIds?.(props.categoryOptions.map((item) => item.id))}
        >
          全选分类
        </button>
      </div>

      <textarea
        placeholder="请输入你的问题，例如：Agent 规划与执行分离在产品落地中怎么做？"
        value={props.question}
        onChange={(e) => props.onQuestionChange(e.target.value)}
      />

      <div className="toolbar">
        {!props.isRunning ? (
          <button className="primary" disabled={!props.canSubmit} onClick={props.onSubmit}>
            发送问题
          </button>
        ) : (
          <button className="danger" disabled={!props.canCancel} onClick={props.onCancel}>
            停止回答
          </button>
        )}
      </div>
      {props.serverHealthError ? (
        <div className="muted" style={{ marginTop: 8 }}>
          后端连接异常：{props.serverHealthError}
          {props.onRetryHealthCheck ? (
            <button style={{ marginLeft: 8 }} onClick={props.onRetryHealthCheck}>
              重新检测
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
