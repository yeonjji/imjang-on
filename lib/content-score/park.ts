// 공원 상세 내용 점수(최대 10) — 설계 §3.6
import { parkFacilityGroups, parkInfoRows } from '@/lib/urban/park-display';
import type { ParkRaw } from '@/lib/urban/adapters/park';
import { type Breakdown, tier, nearbyPoints, filled } from './core';

export function ownPark(r: ParkRaw, hasLocation: boolean): Breakdown {
  // 면적 순위는 주간 계산(weeklyPark) — 여기선 그 행을 빼고 5항목만 센다.
  const info = parkInfoRows(r, null).filter(([k]) => k !== '면적 순위');
  return {
    depth: tier(info.filter(([, v]) => filled(v)).length, [3, 4, 5]),
    facilities: parkFacilityGroups(r).length > 0 ? 2 : 0,
    map: hasLocation ? 1 : 0, // 좌표 없으면 상세는 빈 상태 카드
  };
}

export function weeklyPark(f: { areaRank: boolean; apts: boolean; subway: boolean; infra: boolean }): Breakdown {
  return { areaRank: f.areaRank ? 2 : 0, nearby: nearbyPoints([f.apts, f.subway, f.infra]) };
}
