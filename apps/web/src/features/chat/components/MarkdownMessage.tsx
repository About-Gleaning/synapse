import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface MarkdownMessageProps {
  text: string;
  className?: string;
}

function MarkdownMessageInner(props: MarkdownMessageProps): React.JSX.Element {
  const content = useMemo(() => props.text ?? "", [props.text]);
  const wrapperClassName = props.className ? `md-content ${props.className}` : "md-content";

  return (
    <div className={wrapperClassName}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ ...anchorProps }) => <a {...anchorProps} target="_blank" rel="noreferrer noopener" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export const MarkdownMessage = memo(MarkdownMessageInner);
