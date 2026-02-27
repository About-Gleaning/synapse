import { jsx as _jsx } from "react/jsx-runtime";
const LABEL_MAP = {
    idle: "未开始",
    starting: "启动中",
    running: "运行中",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
    timeout: "超时",
};
export function ChatRunStatusBadge(props) {
    return _jsx("span", { className: `status-badge ${props.status}`, children: LABEL_MAP[props.status] });
}
