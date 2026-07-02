import { accessInsight, priceContextInsight, assembleNarrative, type Insight, type Narrative } from './shared';

export interface SchoolInsightInput {
  name: string;
  schoolKind: string | null;
  foundType: string | null;
  coeduType: string | null;
  nearbySchoolCounts: { kind: string; count: number }[];
  nearestStation: { name: string; lines: string[]; distanceMeters: number } | null;
  infra: { label: string; count: number }[];
  nearbyAptSaleManwon: number[];
}

const FOUND_LABELS = ['공립', '국립', '사립'];
const KIND_ORDER = ['초등학교', '중학교', '고등학교', '특수학교'];

function intro(d: SchoolInsightInput): Insight | null {
  if (!d.schoolKind && !d.foundType) return null;
  const kind = d.schoolKind || '학교';
  let kindPhrase: string;
  if (d.coeduType === '남') kindPhrase = `남자${kind}`;
  else if (d.coeduType === '여') kindPhrase = `여자${kind}`;
  else if (d.coeduType === '남여공학') kindPhrase = `남녀공학 ${kind}`;
  else kindPhrase = kind;
  const foundPrefix = d.foundType && FOUND_LABELS.includes(d.foundType) ? `${d.foundType} ` : '';
  return { key: 'intro', text: `${foundPrefix}${kindPhrase}입니다.` };
}

function district(d: SchoolInsightInput): Insight | null {
  const counts = d.nearbySchoolCounts.filter((c) => c.count > 0);
  if (!counts.length) return null;
  const rank = (k: string) => {
    const i = KIND_ORDER.indexOf(k);
    return i === -1 ? KIND_ORDER.length : i;
  };
  const sorted = [...counts].sort((a, b) => rank(a.kind) - rank(b.kind));
  const list = sorted.map((c) => `${c.kind} ${c.count}곳`).join('·');
  return { key: 'district', text: `도보권에 ${list}이 있어 학령기 학교가 가깝습니다.` };
}

export function buildSchoolNarrative(d: SchoolInsightInput): Narrative | null {
  // 자연 순서: 소개(급별·설립·성별) → 학군(도보권 학교 밀도) → 입지 → 시세.
  const mods = [
    intro(d),
    district(d),
    accessInsight({ nearestStation: d.nearestStation, infra: d.infra }),
    priceContextInsight({ nearbyAptSaleManwon: d.nearbyAptSaleManwon }),
  ];
  return assembleNarrative(d.name, mods, { minFired: 3, requireKeys: ['district'] });
}
