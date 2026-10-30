// 주차장 상세 내용 점수(최대 11) — 설계 §3.7
import { normalizeFees } from '@/lib/urban/parking-fees';
import { hasAnyHours } from '@/lib/urban/parking-hours';
import { parkingHourBlocks, parkingExtrasFlags } from '@/lib/urban/parking-display';
import { getUrbanCategoryDef } from '@/lib/urban/category';
import type { ParkingRaw } from '@/lib/urban/adapters/parking';
import type { ParkingFeeComparison } from '@/lib/urban/parking-context';
import { type Breakdown, tier, nearbyPoints, filled } from './core';

export function ownParking(r: ParkingRaw, hasLocation: boolean): Breakdown {
  const fee = normalizeFees(r);
  const def = getUrbanCategoryDef('parking')!;
  const fields = def.detailFields({ id: r.id, name: r.name, address: r.address, sigunguCode: null, raw: r }, { regionFullName: '' });
  const extras = parkingExtrasFlags(r);
  return {
    depth: tier(fields.filter((f) => filled(f.value)).length, [4, 7]),
    fee: fee.free || fee.items.length > 0 ? 2 : 0, // 그 외는 "요금 정보가 등록되어 있지 않습니다" 카드
    hours: hasAnyHours(parkingHourBlocks(r)) ? 2 : 0,
    extras: extras.hasBadges || extras.hasNote ? 1 : 0,
    map: hasLocation ? 1 : 0,
  };
}

/** parking-fee-compare.tsx의 타일 조건 그대로 */
export function feeCompareShown(cmp: ParkingFeeComparison | null): boolean {
  if (!cmp) return false;
  return (cmp.own30 !== null && cmp.median30 !== null) || (cmp.ownMonthly !== null && cmp.medianMonthly !== null);
}

export function weeklyParking(f: { feeCompare: boolean; apts: boolean; subway: boolean; infra: boolean }): Breakdown {
  return { feeCompare: f.feeCompare ? 1 : 0, nearby: nearbyPoints([f.apts, f.subway, f.infra]) };
}
