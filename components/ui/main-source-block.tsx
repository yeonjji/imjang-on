import Link from 'next/link';
import {
  DATA_SOURCES,
  sourceHost,
  sourceCategoryIcon,
  type DataSourceId,
} from '@/lib/data-sources';

interface MainSourceBlockProps {
  /** 이 페이지의 메인(핵심) 데이터 출처 */
  id: DataSourceId;
  className?: string;
}

/**
 * 상세 페이지 하단의 "메인 데이터 출처" 블록.
 * 핵심 데이터셋의 제공기관·데이터셋명·원본 링크를 레지스트리(SSOT)에서 끌어와 한 블록으로 표시한다.
 * 보조 섹션 출처는 기존 SourceCaption을 그대로 쓴다.
 */
export function MainSourceBlock({ id, className }: MainSourceBlockProps) {
  const s = DATA_SOURCES[id];
  return (
    <section
      className={`flex items-start gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] p-4 ${className ?? ''}`}
    >
      <span
        aria-hidden
        className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-[var(--color-sky-soft)] text-lg"
      >
        {sourceCategoryIcon(s.category)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold tracking-wide text-[var(--color-muted)]">
            메인 데이터 출처
          </span>
          <span className="rounded-full bg-[var(--color-sky-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-blue-dark)]">
            공공데이터
          </span>
        </div>
        <p className="mt-1 text-[15px] font-bold text-[var(--color-blue-dark)]">{s.provider}</p>
        <p className="mt-0.5 text-sm text-[var(--color-text)]">{s.dataset}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {s.url && (
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[var(--color-blue)] hover:underline"
            >
              원본 {sourceHost(s.url)} ↗
            </a>
          )}
          <Link href="/data-source" className="font-semibold text-[var(--color-blue)] hover:underline">
            전체 출처 →
          </Link>
        </div>
      </div>
    </section>
  );
}
