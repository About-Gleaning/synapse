import { jsx as _jsx } from "react/jsx-runtime";
import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
function MarkdownMessageInner(props) {
    const content = useMemo(() => props.text ?? "", [props.text]);
    const wrapperClassName = props.className ? `md-content ${props.className}` : "md-content";
    return (_jsx("div", { className: wrapperClassName, children: _jsx(ReactMarkdown, { remarkPlugins: [remarkGfm], components: {
                a: ({ ...anchorProps }) => _jsx("a", { ...anchorProps, target: "_blank", rel: "noreferrer noopener" }),
            }, children: content }) }));
}
export const MarkdownMessage = memo(MarkdownMessageInner);
