// 학교 상세 내용 점수(고교 최대 9, 초·중 8) — 설계 §3.5
import type { School } from '@prisma/client';
import { schoolInfoRows, isHighSchool } from '@/lib/school-display';
import { type Breakdown, tier, nearbyPoints, filled } from './core';

const HIGH_SCHOOL_ROWS = new Set(['고교 유형', '특목고 계열', '입학 전형']);

export function ownSchool(s: School, hasLocation: boolean): Breakdown {
  const rows = schoolInfoRows(s);
  const pct = rows.length ? (rows.filter(([, v]) => filled(v)).length / rows.length) * 100 : 0;
  const hsShown = isHighSchool(s.schoolKind) && rows.some(([k, v]) => HIGH_SCHOOL_ROWS.has(k) && filled(v));
  return {
    depth: tier(pct, [50, 70, 90]),
    contact: filled(s.tel) || filled(s.homepage) ? 2 : 0, // 전화는 정보 표·Hero, 홈페이지는 Hero 링크
    map: hasLocation ? 1 : 0,
    highSchool: hsShown ? 1 : 0,
  };
}

export function weeklySchool(f: { childcare: boolean; apts: boolean; subway: boolean; infra: boolean }): Breakdown {
  return { nearby: nearbyPoints([f.childcare, f.apts, f.subway, f.infra]) };
}
