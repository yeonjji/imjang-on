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
    <div className="@container">
      {/*
        4열/2열은 뷰포트가 아니라 이 컴포넌트가 실제로 받은 폭으로 정한다. 같은
        뷰포트에서도 놓이는 자리에 따라 폭이 크게 달라지기 때문이다 — 히어로
        왼쪽 열 안이면 약 630px, 전체폭 밴드면 1132px다.

        @container를 이 컴포넌트가 직접 들고 있는 것이 핵심이다. container-type
        조상이 없으면 @4xl:은 조용히 무시된다(빌드·린트·런타임 모두 통과하는데
        폭이 1132px이어도 2열로 렌더된다). 부모에게 맡기면 옮길 때마다 같이
        옮겨야 하는 결합이 남는다.

        임계 @3xl(768px)로는 부족했다 — 실측에서 컨테이너 768px는 라벨박스 107px로
        "아파트/오피스텔/다세대"가 단어 중간에서 깨지고, 800px(111px)은 돼야 한 줄이었다.
        @4xl(896px)은 그 위로 잡은 여유값이다.
      */}
      <div className="grid grid-cols-2 overflow-hidden rounded-[20px] border border-[var(--color-line)] bg-white shadow-[var(--shadow)] @4xl:grid-cols-4">
      {ITEMS.map((item, i) => (
        <div
          key={item.key}
          className={[
            'flex items-center gap-3 p-4 md:p-6 border-[var(--color-line)]',
            i % 2 === 0 ? 'border-r' : '',
            i < 2 ? 'border-b' : '',
            '@4xl:border-b-0',
            i < 3 ? '@4xl:border-r' : '@4xl:border-r-0',
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
    </div>
  );
}
