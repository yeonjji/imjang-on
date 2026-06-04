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
    <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-[20px] border border-[var(--color-line)] bg-white shadow-[var(--shadow)] md:grid-cols-4">
      {ITEMS.map((item, i) => (
        <div
          key={item.key}
          className={[
            'flex items-center gap-3 p-4 md:p-6 border-[var(--color-line)]',
            i % 2 === 0 ? 'border-r' : '',
            i < 2 ? 'border-b' : '',
            'md:border-b-0',
            i < 3 ? 'md:border-r' : 'md:border-r-0',
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
  );
}
