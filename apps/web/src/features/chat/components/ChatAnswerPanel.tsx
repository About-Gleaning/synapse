import type { ChatRunStatus } from "@synapse/shared";

export interface ChatAnswerPanelProps {
  text: string;
  isStreaming: boolean;
  isFinal: boolean;
  status: ChatRunStatus;
  error?: { code: string; message: string } | null;
  citationIds?: string[];
  onRetry?: () => void;
  onCopy?: (text: string) => void;
}

export function ChatAnswerPanel(props: ChatAnswerPanelProps): React.JSX.Element {
  return (
    <section className="panel">
      <h3>最终输出</h3>
      <div className="toolbar">
        <span className={`status-badge ${props.status}`}>{props.status}</span>
        <button onClick={() => props.onCopy?.(props.text)} disabled={!props.text}>
          复制
        </button>
        {props.onRetry ? (
          <button className="primary" onClick={props.onRetry}>
            重新提问
          </button>
        ) : null}
      </div>

      {props.error ? <div className="muted">错误：{props.error.message}</div> : null}
      <article className="answer-box">{props.text || "等待回答..."}</article>
      <div className="muted">
        {props.isStreaming ? "流式输出中..." : props.isFinal ? "输出完成" : "尚未完成"}
      </div>
      <div className="muted">引用ID：{props.citationIds?.join(", ") || "无"}</div>
    </section>
  );
}
