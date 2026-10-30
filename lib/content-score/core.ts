/**
 * 목록 기본 정렬용 상세 내용 점수 공통 유틸.
 * 설계: docs/superpowers/specs/2026-10-30-list-content-score-design.md (핵심 2·부가 1·깊이 0~4·주변 합계 최대 2)
 */
/** IngestionRun.source — 헬스 체크가 실제 수집과 구분할 때도 쓴다 */
export const CONTENT_SCORE_SOURCE = 'content-score';

export type Breakdown = Record<string, number>;

export const NEARBY_CAP = 2;
const SEOUL_RANK = 10_000;

export function sum(b: Breakdown): number {
  return Object.values(b).reduce((a, v) => a + v, 0);
}

/** cuts(오름차순 하한) 중 n이 넘은 개수. 예: tier(4, [1, 4]) = 2 */
export function tier(n: number | null | undefined, cuts: number[]): number {
  if (n == null) return 0;
  return cuts.filter((c) => n >= c).length;
}

export function nearbyPoints(flags: boolean[]): number {
  return Math.min(NEARBY_CAP, flags.filter(Boolean).length);
}

/** 화면에 값으로 보이는가 — null·빈 문자열·'-'(빈 칸 표기)는 아님 */
export function filled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') {
    const t = v.trim();
    return t !== '' && t !== '-';
  }
  return true;
}

export function listRankOf(isSeoul: boolean, score: number): number {
  return (isSeoul ? SEOUL_RANK : 0) + score;
}
