/**
 * 건축물 정보 섹션 표시 모델(순수). UI 확정본: docs/superpowers/mockups/2026-10-20-building-register.html
 * - 아파트: 단지 정보(K-apt)·관리비와 겹치지 않는 항목만(건폐율·용적률·내진·지역지구·구조·최고층).
 * - 내진설계는 '적용' 수만 표시한다. 0은 미적용인지 미기재인지 구분할 수 없다(표본 실측).
 * - 근린생활시설 안내는 빌라만.
 */
import { buildingAgeYears } from '@/lib/insights/apt-complex';
import { kstDate } from '@/lib/insights/maintenance-cost';

export type BuildingPropertyType = 'APARTMENT' | 'OFFICETEL' | 'ROW_HOUSE' | 'MULTIPLEX';

export interface BuildingRegisterRow {
  useAprDate: Date | null;
  structure: string | null;
  mainPurpose: string | null;
  etcPurpose: string | null;
  groundFloors: number | null;
  undergroundFloors: number | null;
  mainBuildingCount: number | null;
  households: number | null;
  units: number | null;
  elevators: number | null;
  parkingTotal: number | null;
  bcRat: number | null;
  vlRat: number | null;
  seismicApplied: number | null;
  zoningKind: string | null;
  zoningName: string | null;
  hasNeighborhoodFacility: boolean;
  registerCreatedAt: Date | null;
  fetchedAt: Date;
}

export interface BuildingTile {
  label: string;
  value: string;
  sub?: string;
}
export interface BuildingRow {
  label: string;
  value: string;
  note?: string;
}
export interface BuildingView {
  tiles: BuildingTile[];
  rows: BuildingRow[];
  neighborhoodNotice: boolean;
  createdLabel: string | null;
  fetchedLabel: string;
  formula: string | null;
}

const pct = (n: number) => `${Number(n.toFixed(2))}%`;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function buildBuildingView(r: BuildingRegisterRow, type: BuildingPropertyType, now: Date): BuildingView | null {
  const tiles: BuildingTile[] = [];
  const rows: BuildingRow[] = [];
  let formula: string | null = null;
  const seismic = r.seismicApplied ?? 0;
  const zoning = r.zoningName ? { label: '지역지구', value: r.zoningName, ...(r.zoningKind ? { note: `(${r.zoningKind})` } : {}) } : null;
  const floors =
    r.groundFloors !== null ? `지상 ${r.groundFloors}층${r.undergroundFloors !== null ? ` · 지하 ${r.undergroundFloors}층` : ''}` : null;

  if (type === 'APARTMENT') {
    if (r.bcRat !== null) tiles.push({ label: '건폐율', value: pct(r.bcRat), sub: '대지 중 건물이 덮은 비율' });
    if (r.vlRat !== null) tiles.push({ label: '용적률', value: pct(r.vlRat), sub: '대지 대비 연면적' });
    if (seismic > 0) {
      // '몇 개 동 중'은 전부 적용일 때만 — 일부만이면 나머지가 '미적용'으로 읽히는데 0은 미기재일 수 있다.
      const all = r.mainBuildingCount !== null && seismic === r.mainBuildingCount;
      tiles.push({ label: '내진설계', value: `${seismic}개 동 적용`, ...(all ? { sub: `주건축물 ${r.mainBuildingCount}개 동 중` } : {}) });
    }
    if (zoning) rows.push(zoning);
    if (r.structure) rows.push({ label: '구조', value: r.structure });
    if (floors) rows.push({ label: '최고층', value: floors });
    if (tiles.length === 0 && rows.length === 0) return null;
  } else {
    const age = buildingAgeYears(r.useAprDate, now);
    if (age !== null && r.useAprDate) {
      tiles.push({ label: '사용승인', value: `${age}년차`, sub: `${r.useAprDate.getUTCFullYear()}년 ${r.useAprDate.getUTCMonth() + 1}월` });
    }
    const isOffi = type === 'OFFICETEL';
    const hh = r.households ?? 0;
    const ho = r.units ?? 0;
    // 세대와 호가 함께 있는 건물(주거+오피스텔·상가 호실)은 총 주차대수가 둘 다를 위한 값이라 합친 수로 나눈다.
    const mixed = hh > 0 && ho > 0;
    const den = mixed ? hh + ho : isOffi ? ho || hh || null : hh || ho || null;
    const per = mixed ? '세대·호당' : (isOffi ? ho : !hh) ? '호당' : '세대당';
    const denLabel = mixed ? '(세대수 + 호수)' : per === '호당' ? '호수' : '세대수';
    if (r.groundFloors !== null) {
      const count = mixed
        ? `${hh.toLocaleString('ko-KR')}세대 · ${ho.toLocaleString('ko-KR')}호`
        : den !== null
          ? `${den.toLocaleString('ko-KR')}${per === '호당' ? '호' : '세대'}`
          : null;
      const sub = [r.undergroundFloors !== null ? `지하 ${r.undergroundFloors}층` : null, count].filter(Boolean).join(' · ');
      tiles.push({ label: '규모', value: `지상 ${r.groundFloors}층`, ...(sub ? { sub } : {}) });
    }
    if (r.parkingTotal !== null) {
      if (den) {
        tiles.push({ label: '주차', value: `${per} ${(r.parkingTotal / den).toFixed(2)}대`, sub: `총 ${r.parkingTotal.toLocaleString('ko-KR')}대` });
        formula = `${per} 주차 = 총 주차대수 ÷ ${denLabel}`;
      } else {
        tiles.push({ label: '주차', value: `총 ${r.parkingTotal.toLocaleString('ko-KR')}대` });
      }
    }
    if (r.elevators !== null) tiles.push({ label: '승강기', value: `${r.elevators}대` });
    if (r.bcRat !== null) tiles.push({ label: '건폐율', value: pct(r.bcRat) });
    if (r.vlRat !== null) tiles.push({ label: '용적률', value: pct(r.vlRat) });
    if (r.mainPurpose) rows.push({ label: '주용도', value: r.mainPurpose, ...(r.etcPurpose ? { note: `기타: ${r.etcPurpose}` } : {}) });
    if (zoning) rows.push(zoning);
    if (r.structure) rows.push({ label: '구조', value: r.structure });
    if (seismic > 0) rows.push({ label: '내진설계', value: '적용' });
    if (tiles.length === 0 && rows.length === 0) return null;
  }

  return {
    tiles,
    rows,
    neighborhoodNotice: (type === 'ROW_HOUSE' || type === 'MULTIPLEX') && r.hasNeighborhoodFacility,
    createdLabel: r.registerCreatedAt ? ymd(r.registerCreatedAt) : null,
    fetchedLabel: kstDate(r.fetchedAt),
    formula,
  };
}
