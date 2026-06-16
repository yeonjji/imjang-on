import { normalizeName } from '@/lib/slug';

/** 게시글 slug: `YYYY-MM-DD-정규화제목`(40자 컷). 충돌 시 suffix(>=2) 부여. */
export function buildBoardSlug(title: string, dateISO: string, suffix?: number): string {
  const base = `${dateISO}-${normalizeName(title).slice(0, 40)}`;
  return suffix && suffix >= 2 ? `${base}-${suffix}` : base;
}
