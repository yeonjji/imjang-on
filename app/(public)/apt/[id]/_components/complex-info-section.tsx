import { Card } from '@/components/ui/card';
import { SourceCaption } from '@/components/ui/source-caption';
import {
  buildDensity,
  buildingAgeYears,
  shouldRenderComplexInfo,
  type ComplexFacts,
} from '@/lib/insights/apt-complex';

interface Tile {
  key: string;
  label: string;
  value: string;
  sub?: string;
}

/**
 * 단지 정보 — 가공값이 주인이고 원자료는 보조다.
 * "주차 12,096대"가 아니라 "세대당 1.27대 / 전부 지하"로 보여준다.
 *
 * facts가 없거나 타일이 3개 미만이면 아무것도 렌더하지 않는다. 한두 칸짜리 카드는
 * 정보가 아니라 빈칸으로 읽히고, 그런 페이지가 느는 것이 곧 얇은 콘텐츠다.
 */
export function ComplexInfoSection({
  facts,
  now,
  id,
}: {
  facts: ComplexFacts | null;
  now: Date;
  id?: string;
}) {
  if (!shouldRenderComplexInfo(facts, now)) return null;
  const f = facts!;
  const d = buildDensity(f);
  const age = buildingAgeYears(f.usedate, now);

  const tiles: Tile[] = [];
  if (d.parkingPerHousehold != null) {
    tiles.push({
      key: 'parking',
      label: '세대당 주차',
      value: `${d.parkingPerHousehold.toFixed(2)}대`,
      sub: d.parkingAllUnderground ? '전부 지하' : undefined,
    });
  }
  if (age != null) {
    tiles.push({
      key: 'age',
      label: '준공',
      value: `${age}년차`,
      sub: f.usedate ? `${f.usedate.getUTCFullYear()}년` : undefined,
    });
  }
  if (d.householdsPerElevator != null) {
    tiles.push({ key: 'elev', label: '승강기', value: `${d.householdsPerElevator}세대당`, sub: '1대' });
  }
  if (d.evPer100 != null) {
    tiles.push({ key: 'ev', label: 'EV 충전', value: '100세대당', sub: `${d.evPer100.toFixed(1)}기` });
  }
  if (d.cctvPer100 != null) {
    tiles.push({ key: 'cctv', label: 'CCTV', value: '100세대당', sub: `${d.cctvPer100.toFixed(0)}대` });
  }
  if (f.households != null) {
    tiles.push({
      key: 'scale',
      label: '규모',
      value: `${f.households.toLocaleString('ko-KR')}세대`,
      sub: f.buildingCount != null ? `${f.buildingCount}개 동` : undefined,
    });
  }

  const structure = [
    f.hallType,
    f.topFloor != null
      ? `지상 ${f.topFloor}층${f.baseFloor != null ? ` / 지하 ${f.baseFloor}층` : ''}`
      : null,
  ].filter(Boolean);

  return (
    <Card id={id}>
      <h2 className="mb-4 text-xl font-bold text-[var(--color-blue-dark)]">단지 정보</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.key} className="rounded-2xl bg-[var(--color-soft)] p-4">
            <p className="text-xs text-[var(--color-muted)]">{t.label}</p>
            <p className="mt-1 text-[17px] font-bold text-[var(--color-blue-dark)]">{t.value}</p>
            {t.sub && <p className="mt-0.5 text-xs text-[var(--color-muted)]">{t.sub}</p>}
          </div>
        ))}
      </div>
      {structure.length > 0 && (
        <p className="mt-4 break-keep text-sm text-[var(--color-text)]">{structure.join(' · ')}</p>
      )}
      {f.builder && (
        <p className="mt-1 break-keep text-sm text-[var(--color-muted)]">
          시공사 {f.builder.split(',').map((s) => s.trim()).filter(Boolean).join(' · ')}
        </p>
      )}
      <SourceCaption ids={['molit-apt-complex']} />
      {f.fetchedAt && (
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          {f.fetchedAt.toISOString().slice(0, 10)} 수집
        </p>
      )}
    </Card>
  );
}
