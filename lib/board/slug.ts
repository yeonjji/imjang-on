import { normalizeName } from '@/lib/slug';

/** 게시글 slug: `YYYY-MM-DD-정규화제목`(40자 컷). 충돌 시 suffix(>=2) 부여. */
export function buildBoardSlug(title: string, dateISO: string, suffix?: number): string {
  const base = `${dateISO}-${normalizeName(title).slice(0, 40)}`;
  return suffix && suffix >= 2 ? `${base}-${suffix}` : base;
}

/**
 * 게시글 상세 정규 경로 `/board/<id>`. 사이트 전역(`/apt/<id>`·`/officetel/<id>` 등)과
 * 동일하게 id 기준이라 제목 글자가 URL 경로에 새어 들어갈 일이 없다(% 깨짐 원천 차단).
 */
export function boardPath(id: bigint | number): string {
  return `/board/${id}`;
}
