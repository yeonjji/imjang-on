/**
 * 목록 기본 정렬용 상세 내용 점수 공통 유틸.
 * 설계: docs/superpowers/specs/2026-10-30-list-content-score-design.md (핵심 2·부가 1·깊이 0~4·주변 합계 최대 2)
 */
/** IngestionRun.source — 헬스 체크가 실제 수집과 구분할 때도 쓴다 */
export const CONTENT_SCORE_SOURCE = 'content-score';

export type Breakdown = Record<string, number>;

export const NEARBY_CAP = 2;
// 정렬 키 = 서울 1,000,000 + 점수 × 10,000 + 섞임 값(0~9,999). 점수 최대 22라 자리가 겹치지 않는다.
export const SEOUL_RANK = 1_000_000;
export const SCORE_RANK = 10_000;

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

/**
 * 동점끼리의 순서를 정하는 고정 섞임 값(0~9,999). id가 적재 순서(=대개 이름순)라 id로 동점을 가르면
 * 첫 화면이 가나다순처럼 보인다 — id를 곱셈 해시(Knuth)로 흩어 지역·이름이 섞이게 한다.
 * 같은 id는 항상 같은 값이라 페이지를 넘겨도 순서가 흔들리지 않는다(마지막 동점은 목록 쿼리의 id).
 */
export function tieKey(id: bigint): number {
  return Number(((id * 2654435761n) % 4294967296n) % 10000n);
}

export function listRankOf(isSeoul: boolean, score: number, id: bigint): number {
  return (isSeoul ? SEOUL_RANK : 0) + score * SCORE_RANK + tieKey(id);
}
