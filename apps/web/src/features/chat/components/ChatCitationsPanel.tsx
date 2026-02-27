export interface ChatCitationsPanelProps {
  citations: Array<{
    citationId: string;
    materialId: string;
    materialTitle: string;
    level: "brief_summary" | "detailed_notes" | "original";
    snippet: string;
    anchor?: {
      sectionTitle?: string;
      chunkIndex?: number;
    };
    firstSeenAt: string;
  }>;
  candidates?: Array<{
    materialId: string;
    title: string;
    score: number;
    matchedLevels: Array<"brief_summary" | "detailed_notes" | "original">;
    categoryPaths: string[];
  }>;
  isRunning: boolean;
  onOpenMaterial?: (payload: {
    materialId: string;
    level: "brief_summary" | "detailed_notes" | "original";
    snippet: string;
    anchor?: {
      sectionTitle?: string;
      chunkIndex?: number;
    };
  }) => void;
}

export function ChatCitationsPanel(props: ChatCitationsPanelProps): React.JSX.Element {
  return (
    <section className="panel">
      <h3>引用的文档</h3>
      {props.citations.length === 0 ? <div className="muted">暂无引用，系统正在检索资料</div> : null}
      {props.citations.map((item) => (
        <article key={item.citationId} className="citation-item">
          <div>
            <strong>{item.materialTitle}</strong>
          </div>
          <div className="muted">层级：{item.level}</div>
          <div>{item.snippet}</div>
          <div className="toolbar">
            <button
              onClick={() =>
                props.onOpenMaterial?.({
                  materialId: item.materialId,
                  level: item.level,
                  snippet: item.snippet,
                  anchor: item.anchor,
                })
              }
            >
              打开并定位
            </button>
          </div>
        </article>
      ))}

      {props.candidates && props.candidates.length > 0 ? (
        <details>
          <summary>候选资料（调试视图）</summary>
          {props.candidates.map((item) => (
            <div key={item.materialId} className="muted">
              {item.title} - {item.score.toFixed(3)}
            </div>
          ))}
        </details>
      ) : null}
    </section>
  );
}
