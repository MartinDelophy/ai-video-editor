import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

const plugins = [remarkGfm, remarkBreaks];
const components = {
  a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  table: ({ children }) => <div className="chatcut-markdown-table"><table>{children}</table></div>,
};

export function ChatCutMarkdown({ text }) {
  return <div className="chatcut-message is-assistant chatcut-markdown">
    <ReactMarkdown remarkPlugins={plugins} components={components} skipHtml disallowedElements={["img"]}>{text}</ReactMarkdown>
  </div>;
}
