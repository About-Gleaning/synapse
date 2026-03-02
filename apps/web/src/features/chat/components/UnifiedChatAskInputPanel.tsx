import { useEffect, useMemo, useState } from "react";
import { findMentionTriggerToken, replaceMentionTriggerToken } from "../model/mentionUtils";

export interface UnifiedMentionCandidate {
  materialId: string;
  title: string;
}

export interface UnifiedChatAskInputPanelProps {
  question: string;
  isRunning: boolean;
  canSubmit: boolean;
  canCancel: boolean;
  serverHealthError?: string;
  mentionError?: string;
  selectedMentionTitle?: string;
  mentionCandidates: UnifiedMentionCandidate[];
  onQuestionChange: (value: string) => void;
  onMentionQueryChange: (query: string) => void;
  onSelectMention: (candidate: UnifiedMentionCandidate, nextQuestion: string) => void;
  onClearMention: () => void;
  onSubmit: () => void;
  onCancel: () => void;
  onRetryHealthCheck?: () => void;
}

export function UnifiedChatAskInputPanel(props: UnifiedChatAskInputPanelProps): React.JSX.Element {
  const [activeIndex, setActiveIndex] = useState(0);
  const [mentionDismissed, setMentionDismissed] = useState(false);
  const trigger = useMemo(() => findMentionTriggerToken(props.question), [props.question]);
  const showMentionPicker = !!trigger && !props.isRunning && !mentionDismissed;

  useEffect(() => {
    props.onMentionQueryChange(trigger?.query ?? "");
  }, [trigger?.start, trigger?.end, trigger?.query]);

  useEffect(() => {
    setActiveIndex(0);
    setMentionDismissed(false);
  }, [trigger?.start, trigger?.end, trigger?.query]);

  const selectCandidate = (candidate: UnifiedMentionCandidate): void => {
    if (!trigger) {
      return;
    }
    const nextQuestion = replaceMentionTriggerToken(props.question, trigger, candidate.title);
    props.onQuestionChange(nextQuestion);
    props.onSelectMention(candidate, nextQuestion);
  };

  const clearSelectedMention = (): void => {
    const nextQuestion = props.question.replace(/@\{[^{}]+\}\s*/g, "").trimStart();
    props.onQuestionChange(nextQuestion);
    props.onClearMention();
  };

  return (
    <section className="chat-input-panel">
      {props.selectedMentionTitle ? (
        <div className="chat-input-topbar">
          <span className="mention-chip">已选资料：{props.selectedMentionTitle}</span>
          <button onClick={clearSelectedMention}>移除</button>
        </div>
      ) : (
        <div className="muted" style={{ marginBottom: 8 }}>
          输入 @ 选择资料；不输入 @ 时默认全局会话
        </div>
      )}

      <div className="mention-input-wrap">
        <div className="chat-input-row">
          <textarea
            className="chat-inline-textarea"
            placeholder="@文件名 你的问题"
            value={props.question}
            onChange={(e) => props.onQuestionChange(e.target.value)}
            onKeyDown={(e) => {
              if (showMentionPicker && props.mentionCandidates.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIndex((x) => (x + 1) % props.mentionCandidates.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIndex((x) => (x - 1 + props.mentionCandidates.length) % props.mentionCandidates.length);
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const candidate = props.mentionCandidates[activeIndex];
                  if (candidate) {
                    selectCandidate(candidate);
                  }
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setMentionDismissed(true);
                  return;
                }
              }

              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!props.isRunning && props.canSubmit) {
                  props.onSubmit();
                }
              }
            }}
          />

          {!props.isRunning ? (
            <button className="chat-send-btn" disabled={!props.canSubmit} onClick={props.onSubmit}>
              →
            </button>
          ) : (
            <button className="chat-send-btn danger" disabled={!props.canCancel} onClick={props.onCancel}>
              ■
            </button>
          )}
        </div>

        {showMentionPicker ? (
          <div className="mention-picker">
            {props.mentionCandidates.length === 0 ? (
              <div className="mention-empty">未找到匹配资料，请继续输入关键词</div>
            ) : (
              props.mentionCandidates.map((candidate, index) => (
                <button
                  key={candidate.materialId}
                  className={`mention-option ${index === activeIndex ? "active" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectCandidate(candidate);
                  }}
                >
                  {candidate.title}
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      {props.mentionError ? <div className="mention-error">{props.mentionError}</div> : null}
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
