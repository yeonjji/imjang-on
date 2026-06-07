import Link from 'next/link';
import { sourceShortLabel, type DataSourceId } from '@/lib/data-sources';

interface SourceCaptionProps {
  ids: DataSourceId[];
  className?: string;
}

/**
 * 데이터 섹션 하단에 노출하는 작은 회색 출처 캡션.
 * 예: "출처: 국토교통부 · 건강보험심사평가원 · 자세히 보기"
 */
export function SourceCaption({ ids, className }: SourceCaptionProps) {
  if (ids.length === 0) return null;
  const labels = Array.from(new Set(ids.map(sourceShortLabel)));
  return (
    <p className={`mt-3 text-xs text-[var(--color-muted)] ${className ?? ''}`}>
      출처: {labels.join(' · ')} ·{' '}
      <Link href="/data-source" className="underline hover:text-[var(--color-text)]">
        자세히 보기
      </Link>
    </p>
  );
}
