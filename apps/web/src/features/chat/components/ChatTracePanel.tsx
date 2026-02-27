export interface ChatTracePanelProps {
  items: Array<{
    key: string;
    type: "stage_summary" | "selection_reason";
    title: string;
    content: string;
    timestamp?: string;
  }>;
  isRunning: boolean;
  hasFinalTrace: boolean;
}

export function ChatTracePanel(props: ChatTracePanelProps): React.JSX.Element {
  return (
    <section className="panel">
      <h3>思考过程</h3>
      <div className="muted">{props.hasFinalTrace ? "已生成最终过程摘要" : props.isRunning ? "阶段更新中" : "等待提问"}</div>
      <div style={{ marginTop: 8 }}>
        {props.items.length === 0 ? <div className="muted">暂无过程信息</div> : null}
        {props.items.map((item) => (
          <article key={item.key} className="trace-item">
            <div>
              <strong>{item.title}</strong>
            </div>
            <div>{item.content}</div>
            {item.timestamp ? <div className="muted">{item.timestamp}</div> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
