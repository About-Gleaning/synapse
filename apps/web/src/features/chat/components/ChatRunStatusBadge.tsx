import type { ChatRunStatus } from "@synapse/shared";

const LABEL_MAP: Record<ChatRunStatus, string> = {
  idle: "未开始",
  starting: "启动中",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
  timeout: "超时",
};

export interface ChatRunStatusBadgeProps {
  status: ChatRunStatus;
}

export function ChatRunStatusBadge(props: ChatRunStatusBadgeProps): React.JSX.Element {
  return <span className={`status-badge ${props.status}`}>{LABEL_MAP[props.status]}</span>;
}
