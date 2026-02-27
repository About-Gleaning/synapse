import type { ChatRunStatus, ChatStage, StageStatus } from "@synapse/shared";

export interface ChatProgressPanelProps {
  overallProgress: number;
  runStatus: ChatRunStatus;
  stages: Array<{
    stage: ChatStage;
    stageLabel: string;
    status: StageStatus;
    progress: number;
    summary?: string;
    updatedAt?: string;
  }>;
  startedAt?: string;
  finishedAt?: string;
}

export function ChatProgressPanel(props: ChatProgressPanelProps): React.JSX.Element {
  return (
    <section className="panel">
      <h3>执行流程及进度</h3>
      <div className="progress">
        <span style={{ width: `${props.overallProgress}%` }} />
      </div>
      <div className="muted">总体进度：{props.overallProgress}%</div>
      <div className="muted">运行状态：{props.runStatus}</div>
      {props.startedAt ? <div className="muted">开始时间：{props.startedAt}</div> : null}
      {props.finishedAt ? <div className="muted">结束时间：{props.finishedAt}</div> : null}

      <div style={{ marginTop: 10 }}>
        {props.stages.map((item) => (
          <article key={item.stage} className={`stage-item ${item.status}`}>
            <div>
              <strong>{item.stageLabel}</strong>
            </div>
            <div className="muted">状态：{item.status}</div>
            <div className="muted">进度：{item.progress}%</div>
            {item.summary ? <div>{item.summary}</div> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
