import { externalHref } from '@/lib/external-href';

interface PostSourceProps {
  sourceName: string;
  sourceUrl: string;
  sourceDate: Date;
}

/** 게시글 하단 출처·기준일 블록. 모든 수치의 출처를 명시하는 프로젝트 원칙에 따른다. */
export function PostSource({ sourceName, sourceUrl, sourceDate }: PostSourceProps) {
  const dateStr = sourceDate.toISOString().slice(0, 10);
  return (
    <div className="mt-10 rounded-[18px] border border-[var(--color-line)] bg-[var(--color-soft)] px-5 py-4 text-sm text-[var(--color-muted)]">
      <p>
        출처:{' '}
        <a href={externalHref(sourceUrl)} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--color-text)] underline">
          {sourceName}
        </a>
      </p>
      <p className="mt-1">기준일: {dateStr}</p>
    </div>
  );
}
