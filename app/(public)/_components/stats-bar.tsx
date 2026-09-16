import Link from 'next/link';
import { formatStatCount } from '@/lib/format';
import type { HomeStats } from '@/lib/stats';

const ITEMS = [
  { key: 'transactions', icon: '📊', label: '실거래 데이터' },
  { key: 'properties', icon: '🏢', label: '아파트/오피스텔/다세대' },
  { key: 'schools', icon: '🎓', label: '학교 정보' },
  { key: 'lifeFacilities', icon: '🏪', label: '생활편의시설' },
] as const;

export function StatsBar({ stats }: { stats: HomeStats }) {
  return (
    <>
      {/*
        4열/2열 전환은 뷰포트(md/xl)가 아니라 컨테이너 쿼리(@3xl, hero-section.tsx의
        @container)로 정한다. 이 컴포넌트는 히어로 왼쪽 열 안에서 쓰이는데, 그 실폭은
        뷰포트만으로 못 정한다 — 768px 뷰포트의 단일 컬럼 히어로(카드 패딩만으로
        638px)와 1280px 뷰포트의 오른쪽 패널 squeeze(629px)가 거의 같은 폭이고, 둘 다
        4열이면 "아파트/오피스텔/다세대" 같은 긴 라벨이 단어 중간에서 줄바꿈된다(실측
        확인). 반대로 패널이 없는 1280px+에서는 왼쪽 열이 그대로 ~1050px라 4열이 맞다 —
        뷰포트만 보면 이 둘을 구분할 수 없다. @3xl(48rem/768px 컨테이너 폭)은 638·629
        둘 다 아래, 894px(1024px 뷰포트, 실측상 안 깨짐)보다는 충분히 아래에 잡은
        여유값이다.
      */}
      <div className="grid grid-cols-2 overflow-hidden rounded-[20px] border border-[var(--color-line)] bg-white shadow-[var(--shadow)] @3xl:grid-cols-4">
      {ITEMS.map((item, i) => (
        <div
          key={item.key}
          className={[
            'flex items-center gap-3 p-4 md:p-6 border-[var(--color-line)]',
            i % 2 === 0 ? 'border-r' : '',
            i < 2 ? 'border-b' : '',
            '@3xl:border-b-0',
            i < 3 ? '@3xl:border-r' : '@3xl:border-r-0',
          ].join(' ')}
        >
          <span className="text-2xl" aria-hidden>{item.icon}</span>
          <span className="min-w-0">
            <span className="block text-lg font-black tracking-tight text-[var(--color-blue-dark)] md:text-xl">
              {formatStatCount(stats[item.key])}
            </span>
            <span className="block text-xs text-[var(--color-muted)]">{item.label}</span>
          </span>
        </div>
      ))}
      </div>
      <p className="mt-3 text-xs text-[var(--color-muted)]">
        공공데이터 기반 ·{' '}
        <Link href="/data-source" className="underline hover:text-[var(--color-text)]">
          전체 출처 보기 →
        </Link>
      </p>
    </>
  );
}
