import { externalHref } from '@/lib/external-href';
import { canonicalizeSourceName } from '@/lib/board/source-name';

interface PostSourceProps {
  sourceName: string;
  sourceUrl: string;
  sourceDate: Date;
  /** 임장ON이 요약·정리한 날짜(board 글의 generatedAt). 주어지면 '임장ON 요약일'로 분리 표기. */
  summarizedAt?: Date;
  /** sourceDate 표기 라벨. 기본 '기준일'(가이드), board는 '원문 발행일'. */
  dateLabel?: string;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** 게시글 하단 출처 블록. 원문 출처·원문 발행일·요약일을 분리 표기(프로젝트 출처 표기 원칙). */
export function PostSource({ sourceName, sourceUrl, sourceDate, summarizedAt, dateLabel = '기준일' }: PostSourceProps) {
  return (
    <div className="mt-10 rounded-[18px] border border-[var(--color-line)] bg-[var(--color-soft)] px-5 py-4 text-sm text-[var(--color-muted)]">
      <p>
        원문 출처:{' '}
        <a href={externalHref(sourceUrl)} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--color-text)] underline">
          {canonicalizeSourceName(sourceName)}
        </a>
      </p>
      <p className="mt-1">{dateLabel}: {isoDate(sourceDate)}</p>
      {summarizedAt && <p className="mt-1">임장ON 요약일: {isoDate(summarizedAt)}</p>}
    </div>
  );
}
