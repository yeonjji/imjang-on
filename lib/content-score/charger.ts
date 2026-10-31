// 전기차충전소 상세 내용 점수(최대 11) — 설계 §3.8
import { chargerGuideItems, type ChargerGuideRaw } from '@/lib/urban/charger-display';
import { type Breakdown, tier, nearbyPoints, filled } from './core';

export function ownCharger(
  r: { operatorName: string | null } & ChargerGuideRaw,
  units: { outputKw: number | null; installYear: number | null }[],
  hasLocation: boolean,
): Breakdown {
  const g = chargerGuideItems(r, units);
  return {
    depth: tier(units.length, [2, 5, 10]),
    status: units.length > 0 ? 2 : 0,
    guide: g.tiles.length + g.rows.length > 0 ? 2 : 0,
    operator: filled(r.operatorName) ? 1 : 0,
    map: hasLocation ? 1 : 0,
  };
}

export function weeklyCharger(f: { apts: boolean; subway: boolean; infra: boolean }): Breakdown {
  return { nearby: nearbyPoints([f.apts, f.subway, f.infra]) };
}
