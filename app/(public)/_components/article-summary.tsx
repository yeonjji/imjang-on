import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** 본문 맨 앞 '핵심 요약'을 콜아웃 박스로 보여준다. DESIGN.md: 색은 정보 전달용, 그림자 없음. */
export function ArticleSummary({ markdown }: { markdown: string }) {
  if (!markdown.trim()) return null;
  return (
    <aside className="mt-8 rounded-[18px] border border-[var(--color-line)] bg-[var(--color-soft)] px-5 py-4">
      <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-blue)]">핵심 요약</p>
      <div className="board-prose mt-2 text-[15px] leading-relaxed text-[var(--color-text)]">
        <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{markdown}</ReactMarkdown>
      </div>
    </aside>
  );
}
