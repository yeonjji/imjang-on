import type { HubScopeLevel, HubSummaryData } from './types';

const MIN_TOTAL_FOR_DISTRIBUTION = 30;
const MIN_REGIONS_FOR_DISTRIBUTION = 3;

const nf = (n: number): string => n.toLocaleString('ko-KR');

/** 마지막 글자에 받침(종성)이 있으면 true. 한글 음절이 아니면 false. */
function hasJongseong(word: string): boolean {
  if (!word) return false;
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

/** 주제 조사 은/는 선택 */
function topicParticle(word: string): string {
  return hasJongseong(word) ? '은' : '는';
}

function regionUnitLabel(level: HubScopeLevel): string {
  return level === 'nation' ? '시·도' : '시·군·구';
}

function identitySentence(d: HubSummaryData): string {
  const scope = d.scopeLevel === 'nation' ? '전국' : d.scopeLabel;
  return `${scope}에 등록된 ${d.categoryLabel}${topicParticle(d.categoryLabel)} ${nf(d.total)}곳입니다.`;
}

export function buildHubSummaryLines(d: HubSummaryData): string[] {
  if (d.total <= 0) return [];
  const identity = identitySentence(d);
  const extra = d.highlights ?? [];

  const canDistribute =
    d.scopeLevel !== 'sigungu' &&
    d.total >= MIN_TOTAL_FOR_DISTRIBUTION &&
    d.topRegions.length >= MIN_REGIONS_FOR_DISTRIBUTION &&
    d.concentrationPct != null;

  if (!canDistribute) return [identity, ...extra];

  const unit = regionUnitLabel(d.scopeLevel);
  const top = d.topRegions.slice(0, 3).map((r) => `${r.name}(${nf(r.count)})`).join('·');
  const distribution =
    `${unit}별 분포를 보면 ${top} 순으로 등록 수가 많고, ` +
    `상위 3개 ${unit}가 전체의 약 ${d.concentrationPct}% 비중입니다.`;

  return [identity, distribution, ...extra];
}
