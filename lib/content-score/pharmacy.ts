// 약국 상세 내용 점수(최대 9) — 설계 §3.3
import { buildPharmacyInfoRows } from '@/lib/pharmacy/utils';
import { pharmacyYears } from '@/lib/pharmacy/context';
import { type Breakdown, tier, nearbyPoints } from './core';

export interface PharmacyScoreInput {
  typeName: string | null; openedAt: Date | null; tel: string | null; zipcode: string | null;
  sido: string | null; sigungu: string | null; eupmyeondong: string | null; hasLocation: boolean;
}

export function ownPharmacy(p: PharmacyScoreInput, nowYear: number): Breakdown {
  return {
    depth: tier(buildPharmacyInfoRows(p).length, [3, 4]),
    years: pharmacyYears(p.openedAt, nowYear) !== null ? 2 : 0,
    map: p.hasLocation ? 1 : 0,
  };
}

/** 주간: 같은 동 약국(부가 1)·도보권 일요일 진료(부가 1)·주변(최대 2) */
export function weeklyPharmacy(f: { dong: boolean; sunday: boolean; apts: boolean; subway: boolean; infra: boolean }): Breakdown {
  return {
    dong: f.dong ? 1 : 0,
    sunday: f.sunday ? 1 : 0,
    nearby: nearbyPoints([f.apts, f.subway, f.infra]),
  };
}
