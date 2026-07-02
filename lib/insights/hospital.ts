import { accessInsight, priceContextInsight, assembleNarrative, type Insight, type Narrative } from './shared';
import { josa } from '@/lib/seo/josa';

export interface HospitalInsightInput {
  name: string;
  typeName: string;
  deptCount: number;
  deptWithSpecialistCount: number;
  topDeptNames: string[];
  totalDoctors: number | null;
  specialistTotal: number | null;
  bedCounts: { label: string; count: number }[];
  nearestStation: { name: string; lines: string[]; distanceMeters: number } | null;
  infra: { label: string; count: number }[];
  nearbyAptSaleManwon: number[];
}

function intro(d: HospitalInsightInput): Insight | null {
  if (!d.typeName && d.deptCount < 1) return null;
  const type = d.typeName || '의료기관';
  return {
    key: 'intro',
    text: d.deptCount >= 1
      ? `${josa(type, '으로', '로')} 진료과 ${d.deptCount}개과를 운영합니다.`
      : `${type}입니다.`,
  };
}

function depts(d: HospitalInsightInput): Insight | null {
  if (d.deptCount < 1) return null;
  const names = d.topDeptNames.filter(Boolean).slice(0, 3);
  const parts: string[] = [];
  if (d.deptWithSpecialistCount > 0) parts.push(`전문의가 배치된 과는 ${d.deptWithSpecialistCount}개`);
  if (names.length) parts.push(`주요 진료과는 ${names.join('·')}`);
  if (!parts.length) return null;
  return { key: 'depts', text: `${parts.join(', ')}입니다.` };
}

function doctors(d: HospitalInsightInput): Insight | null {
  if (!d.totalDoctors || d.totalDoctors < 1) return null;
  if (d.specialistTotal != null && d.specialistTotal > 0) {
    const pct = Math.round((d.specialistTotal / d.totalDoctors) * 100);
    const judge = pct >= 80 ? '전문의 중심으로 운영됩니다'
      : pct >= 50 ? '전문의 비중이 높은 편입니다'
      : '일반의·전공의도 함께 근무합니다';
    return { key: 'doctors', text: `의사 ${d.totalDoctors}명 중 전문의가 ${d.specialistTotal}명(약 ${pct}%)으로 ${judge}.` };
  }
  return { key: 'doctors', text: `의사 ${d.totalDoctors}명이 근무합니다.` };
}

function beds(d: HospitalInsightInput): Insight | null {
  const b = d.bedCounts.filter((x) => x.count > 0);
  if (!b.length) return null;
  const total = b.reduce((s, x) => s + x.count, 0);
  const has = (label: string) => b.some((x) => x.label === label);
  const list = b.map((x) => `${x.label} ${x.count}`).join('·');
  const scale = (has('응급실') || has('중환자실')) ? '입원·응급 진료가 가능한 규모입니다'
    : has('수술실') ? '수술이 가능한 시설을 갖췄습니다'
    : total >= 30 ? '입원 병상을 갖춘 규모입니다'
    : '소규모 병상을 운영합니다';
  return { key: 'beds', text: `${list} 등 ${scale}.` };
}

export function buildHospitalNarrative(d: HospitalInsightInput): Narrative | null {
  // 자연 순서: 소개(유형·진료과 수) → 진료과 구성 → 의사 → 병상 → 입지 → 시세.
  const mods = [
    intro(d),
    depts(d),
    doctors(d),
    beds(d),
    accessInsight({ nearestStation: d.nearestStation, infra: d.infra }),
    priceContextInsight({ nearbyAptSaleManwon: d.nearbyAptSaleManwon }),
  ];
  return assembleNarrative(d.name, mods, { minFired: 3, requireKeys: ['depts', 'doctors'] });
}
