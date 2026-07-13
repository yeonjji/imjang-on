/**
 * 참조글 나이 필터. 자동 생성기(runner.ts)가 오래된 기사로 글을 만들지 않도록,
 * 발행일이 MAX_SOURCE_AGE_DAYS를 넘거나 발행일이 없는 후보를 생성 전에 제외한다.
 * 랭킹(최신순)만으로는 최신 후보가 적은 주에 옛날 기사가 선택될 수 있어 하드 게이트가 필요.
 */
import type { BoardCandidate } from './candidate';

/** 참조글 허용 최대 나이(일). 발행일이 이 값 이내여야 생성 대상. */
export const MAX_SOURCE_AGE_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** pubDate가 now 기준 MAX_SOURCE_AGE_DAYS 이내면 true. null이면 false(나이 보증 불가). */
export function isFresh(pubDate: Date | null, now: Date): boolean {
  if (!pubDate) return false;
  return now.getTime() - pubDate.getTime() <= MAX_SOURCE_AGE_DAYS * DAY_MS;
}

/** 나이 초과·발행일 없음 후보를 제외. staleDropped = 제외된 개수(관측용). */
export function dropStale(
  cands: BoardCandidate[],
  now: Date,
): { kept: BoardCandidate[]; staleDropped: number } {
  const kept = cands.filter((c) => isFresh(c.pubDate, now));
  return { kept, staleDropped: cands.length - kept.length };
}
