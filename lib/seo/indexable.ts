import type { Narrative } from '@/lib/insights/shared';

/**
 * 상세 페이지 색인 규칙(단일 소스). narrative가 있고 발화 모듈이 minFired개 이상이면 index.
 * 각 페이지 generateMetadata가 인라인하던 `!!narrative && narrative.fired.length >= N`을 대체한다.
 * park만 minFired=2, 나머지는 3.
 */
export function isNarrativeIndexable(narrative: Narrative | null, minFired = 3): boolean {
  return !!narrative && narrative.fired.length >= minFired;
}

/** robots 메타 헬퍼 — noindex여도 follow는 유지(링크 전파). */
export function robotsFor(indexable: boolean): { index: boolean; follow: boolean } {
  return { index: indexable, follow: true };
}
