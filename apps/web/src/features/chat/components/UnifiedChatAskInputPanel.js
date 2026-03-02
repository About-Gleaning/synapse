import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { findMentionTriggerToken, replaceMentionTriggerToken } from "../model/mentionUtils";
export function UnifiedChatAskInputPanel(props) {
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
    const selectCandidate = (candidate) => {
        if (!trigger) {
            return;
        }
        const nextQuestion = replaceMentionTriggerToken(props.question, trigger, candidate.title);
        props.onQuestionChange(nextQuestion);
        props.onSelectMention(candidate, nextQuestion);
    };
    const clearSelectedMention = () => {
        const nextQuestion = props.question.replace(/@\{[^{}]+\}\s*/g, "").trimStart();
        props.onQuestionChange(nextQuestion);
        props.onClearMention();
    };
    return (_jsxs("section", { className: "chat-input-panel", children: [props.selectedMentionTitle ? (_jsxs("div", { className: "chat-input-topbar", children: [_jsxs("span", { className: "mention-chip", children: ["\u5DF2\u9009\u8D44\u6599\uFF1A", props.selectedMentionTitle] }), _jsx("button", { onClick: clearSelectedMention, children: "\u79FB\u9664" })] })) : (_jsx("div", { className: "muted", style: { marginBottom: 8 }, children: "\u8F93\u5165 @ \u9009\u62E9\u8D44\u6599\uFF1B\u4E0D\u8F93\u5165 @ \u65F6\u9ED8\u8BA4\u5168\u5C40\u4F1A\u8BDD" })), _jsxs("div", { className: "mention-input-wrap", children: [_jsxs("div", { className: "chat-input-row", children: [_jsx("textarea", { className: "chat-inline-textarea", placeholder: "@\u6587\u4EF6\u540D \u4F60\u7684\u95EE\u9898", value: props.question, onChange: (e) => props.onQuestionChange(e.target.value), onKeyDown: (e) => {
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
                                } }), !props.isRunning ? (_jsx("button", { className: "chat-send-btn", disabled: !props.canSubmit, onClick: props.onSubmit, children: "\u2192" })) : (_jsx("button", { className: "chat-send-btn danger", disabled: !props.canCancel, onClick: props.onCancel, children: "\u25A0" }))] }), showMentionPicker ? (_jsx("div", { className: "mention-picker", children: props.mentionCandidates.length === 0 ? (_jsx("div", { className: "mention-empty", children: "\u672A\u627E\u5230\u5339\u914D\u8D44\u6599\uFF0C\u8BF7\u7EE7\u7EED\u8F93\u5165\u5173\u952E\u8BCD" })) : (props.mentionCandidates.map((candidate, index) => (_jsx("button", { className: `mention-option ${index === activeIndex ? "active" : ""}`, onMouseDown: (e) => {
                                e.preventDefault();
                                selectCandidate(candidate);
                            }, children: candidate.title }, candidate.materialId)))) })) : null] }), props.mentionError ? _jsx("div", { className: "mention-error", children: props.mentionError }) : null, props.serverHealthError ? (_jsxs("div", { className: "muted", style: { marginTop: 8 }, children: ["\u540E\u7AEF\u8FDE\u63A5\u5F02\u5E38\uFF1A", props.serverHealthError, props.onRetryHealthCheck ? (_jsx("button", { style: { marginLeft: 8 }, onClick: props.onRetryHealthCheck, children: "\u91CD\u65B0\u68C0\u6D4B" })) : null] })) : null] }));
}
