import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { splitGuideBody } from '@/lib/guide/body-parts';
import { GUIDE_DATA_BLOCK_COMPONENTS } from './data-block';

/**
 * 가이드 본문을 렌더한다. `[[data:<키>]]` 표식이 있으면 그 자리에 데이터 블록을 끼운다.
 * 표식이 없으면 조각이 하나뿐이라 기존 렌더와 동일하다.
 *
 * `.board-prose`는 마크다운 조각에만 건다(바깥 div가 아니라). 그 규칙이 레이어 없이 선언돼 있어
 * Tailwind 유틸리티를 명시도와 무관하게 덮어써, 바깥 div에 걸면 데이터 블록의 표까지 함께 덮인다.
 */
export function GuideBody({ body }: { body: string }) {
  const parts = splitGuideBody(body);
  return (
    <div className="mt-8 text-[15px] leading-relaxed text-[var(--color-text)]">
      {parts.map((part, i) => {
        if (part.kind === 'markdown') {
          return (
            <div key={i} className="board-prose">
              <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>
                {part.text}
              </ReactMarkdown>
            </div>
          );
        }
        const Block = GUIDE_DATA_BLOCK_COMPONENTS[part.key];
        return <Block key={i} />;
      })}
    </div>
  );
}
