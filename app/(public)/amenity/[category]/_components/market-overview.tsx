import { Card } from '@/components/ui/card';
import type { AmenityItem } from '@/lib/amenity/category';
import { parseMarketDays, marketDaysShort, marketDaysLong, marketAgeYears } from '@/lib/amenity/market-display';

interface Tile { label: string; value: string; sub?: string }

function yn(v: boolean | null | undefined): string {
  if (v === true) return '있음';
  if (v === false) return '없음';
  return '정보 없음';
}

export function MarketOverview({ item, nowYear }: { item: AmenityItem; nowYear: number }) {
  const tiles: Tile[] = [];
  if (item.storeCount) tiles.push({ label: '점포 수', value: `${item.storeCount.toLocaleString('ko-KR')}곳` });
  const age = marketAgeYears(item.establishedYear, nowYear);
  if (age !== null) {
    tiles.push({ label: '개설', value: age === 0 ? '올해' : `${age}년`, sub: `${item.establishedYear}년 개설` });
  }
  const days = parseMarketDays(item.openCycle);
  if (days) {
    tiles.push({
      label: '장날',
      value: marketDaysShort(days),
      sub: days.kind === 'raw' ? undefined : marketDaysLong(days),
    });
  }
  if (item.hasParking != null || item.hasToilet != null) {
    const have = [item.hasParking && '주차장', item.hasToilet && '공중화장실'].filter(Boolean);
    tiles.push({
      label: '방문 편의',
      // 하나라도 모르면 '없음'으로 단정하지 않는다(세부는 sub 줄이 정확히 보여준다).
      value: have.length
        ? have.join('·')
        : item.hasParking === false && item.hasToilet === false
          ? '없음'
          : '정보 없음',
      sub: `주차장 ${yn(item.hasParking)} · 화장실 ${yn(item.hasToilet)}`,
    });
  }
  if (tiles.length === 0) return null;

  return (
    <Card id="market-overview">
      <h2 className="mb-4 text-lg font-bold text-[var(--color-blue-dark)]">시장 한눈에</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-[var(--color-soft)] p-4">
            <p className="text-xs font-bold text-[var(--color-text)]">{t.label}</p>
            <p className="mt-1.5 text-xl font-extrabold tracking-tight text-[var(--color-blue-dark)]">{t.value}</p>
            {t.sub && <p className="mt-1 text-sm text-[var(--color-text)]">{t.sub}</p>}
          </div>
        ))}
      </div>
      {item.referenceDate && (
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          공공데이터 기준일 {item.referenceDate.toISOString().slice(0, 10)}
        </p>
      )}
    </Card>
  );
}
